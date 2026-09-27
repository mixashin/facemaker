// Reads the state of facemaker on a phone over USB: tracker, GPU, service worker, caches, console.
// Needs: adb on PATH, USB debugging on, the phone attached and UNLOCKED, facemaker open and in front
// (Chrome tab or installed app). Node 22 or newer (WebSocket).
// Privacy: it talks to the page of facemaker only. It never attaches to another tab and never prints the address
// of one. It takes no picture and reads no photo.
//
//   node scripts/phone-inspect.mjs            # state of the open page
//   node scripts/phone-inspect.mjs reload     # loads the page again first, so the console holds the start of the tracker
//   PHONE_WAIT_MS=20000 PHONE_MATCH=localhost:5173 node scripts/phone-inspect.mjs reload   # PHONE_MATCH: the host of the app, with its port
//   PHONE_TAP="retry camera" node scripts/phone-inspect.mjs   # taps a button of the app first (aria-label)
//   PHONE_GO="/?tracker=gpu" node scripts/phone-inspect.mjs   # goes to an address inside the app first
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { ownPages } from './phone-pages.mjs';

// A free port of this computer. A fixed one can belong to another program, and then the tool reads a wrong browser.
const PORT = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const match = process.env.PHONE_MATCH ?? 'face.mxa.sh';
const wait = Number(process.env.PHONE_WAIT_MS ?? 12000);
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = adb('devices').split(/\r?\n/).slice(1).filter((l) => /\tdevice$/.test(l));
if (!devices.length) { console.error('No phone. Attach it by USB, turn on USB debugging, accept the prompt on the phone. `adb devices` must list it as "device".'); process.exit(1); }
console.log('phone:', adb('shell', 'getprop', 'ro.product.model'), '| Android', adb('shell', 'getprop', 'ro.build.version.release'), '| chip', adb('shell', 'getprop', 'ro.soc.model') || adb('shell', 'getprop', 'ro.board.platform'));
const screen = adb('shell', 'dumpsys', 'deviceidle');
if (/mScreenLocked=true/.test(screen) || /mScreenOn=false/.test(screen)) { console.error('The phone is locked or its screen is off. Unlock it and open facemaker: the camera cannot start on a locked phone.'); process.exit(1); }
adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
const unforward = () => { try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* the forward is gone with the cable */ } };
// Ctrl+C, Ctrl+Break, a closed console window, an end from outside: the forward must go too. While it is there,
// every program on this computer can reach the browser of the phone.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { unforward(); process.exit(130); });

// What the page tells about itself. Runs in the page.
const READ = `(async () => {
  const fm = globalThis.__fm, v = document.querySelector('video');
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'on, renderer name hidden') : 'NOT AVAILABLE';
  if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } // a phone has few WebGL contexts: give this one back
  const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
  const stores = {};
  for (const k of await caches.keys()) stores[k.replace(location.origin, '')] = (await (await caches.open(k)).keys()).length;
  return {
    address: location.origin + location.pathname + location.search,
    inFront: document.visibilityState,
    installed: matchMedia('(display-mode: standalone)').matches,
    agent: navigator.userAgent,
    screen: innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio,
    video: v ? v.videoWidth + 'x' + v.videoHeight + ' readyState ' + v.readyState + ' paused ' + v.paused : 'no video element',
    tracker: fm ? { results: fm.frames, faces: fm.faces, delegate: fm.delegate || 'not ready', masks: fm.masks } : 'no debug state (old copy of the app?)',
    health: fm && fm.health ? Object.fromEntries(Object.entries(fm.health).filter(([, x]) => typeof x !== 'function')) : 'this version of the app has no tracker health',
    version: (document.querySelector('.version span') || {}).textContent || 'not on the screen (the settings show it)',
    webgl2: renderer,
    serviceWorker: reg && reg.active ? reg.active.state : 'none',
    caches: stores,
    onScreen: [...document.querySelectorAll('[role=dialog], [role=alertdialog], .big')].map((e) => (e.getAttribute('aria-label') || e.textContent || '').slice(0, 60)),
    buttons: [...document.querySelectorAll('button')].slice(0, 14).map((e) => e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 12)),
    cameraPermission: await navigator.permissions.query({ name: 'camera' }).then((r) => r.state).catch(() => 'not known'),
  };
})()`;

let ws;
try {
  const who = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  if (!who['Android-Package']) throw new Error('the other end is not a browser on a phone: ' + (who.Browser ?? 'not known'));
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const pages = targets.filter((t) => t.type === 'page');
  const mine = ownPages(targets, match);
  console.log('pages of the app:', mine.length, '| other pages (not read):', pages.length - mine.length);
  if (!mine.length) { console.error(`No open page of the host "${match}". Open facemaker on the phone and keep it in front.`); process.exitCode = 1; }
  else {
    // One link, to the page of the app only. Its workers come over the same link (flat sessions).
    ws = new WebSocket(mine[0].webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('no link to the page')); });
    let next = 1;
    const waiting = new Map(), logs = [];
    const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
      const id = next++;
      waiting.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (waiting.delete(id)) fail(new Error(method + ': no answer in 20 s')); }, 20000);
    });
    const text = (a) => (a.value !== undefined ? String(a.value) : a.description ?? a.unserializableValue ?? a.type);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { const w = waiting.get(m.id); waiting.delete(m.id); if (w) (m.error ? w.fail(new Error(m.error.message)) : w.ok(m.result)); return; }
      const from = m.sessionId ? 'worker ' : '';
      if (m.method === 'Target.attachedToTarget') { const s = m.params.sessionId; send('Runtime.enable', {}, s).catch(() => {}); send('Log.enable', {}, s).catch(() => {}); send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {}); }
      else if (m.method === 'Runtime.consoleAPICalled') logs.push(`${from}${m.params.type}: ${m.params.args.map(text).join(' ')}`);
      else if (m.method === 'Runtime.exceptionThrown') logs.push(`${from}exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      else if (m.method === 'Log.entryAdded') logs.push(`${from}${m.params.entry.level}: ${m.params.entry.text}`);
    };
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    if (process.argv[2] === 'reload') { await send('Page.reload'); console.log('page loaded again'); await sleep(3000); }
    // PHONE_GO=<address inside the app>: goes there first, for example /?tracker=cpu
    if (process.env.PHONE_GO) { const to = new URL(process.env.PHONE_GO, mine[0].url).href; if (new URL(to).origin !== new URL(mine[0].url).origin) throw new Error('PHONE_GO must stay inside the app'); await send('Page.navigate', { url: to }); console.log('went to', to); await sleep(3000); }
    if (process.env.PHONE_TAP) console.log('tap', process.env.PHONE_TAP, await evaluate(`(() => { const b = document.querySelector('[aria-label=${JSON.stringify(process.env.PHONE_TAP)}]'); if (!b) return 'no such button'; b.click(); return 'done'; })()`));
    await sleep(2500); // a tap or a new load can start the page again
    const read = () => evaluate(READ).catch(() => sleep(2000).then(() => evaluate(READ)));
    const a = await read();
    await sleep(wait);
    const b = await read();
    console.log(JSON.stringify(b, null, 2));
    if (typeof a.tracker === 'object' && typeof b.tracker === 'object') {
      const n = b.tracker.results - a.tracker.results;
      console.log(`in ${wait / 1000} s: tracker results ${n}, faces in the last result ${b.tracker.faces}`);
      if (b.inFront !== 'visible') console.log('VERDICT: the app is not in front. Open it on the phone and run again.');
      else if (b.tracker.delegate === 'not ready') console.log('VERDICT: the tracker did not start. Look for errors in the console below.');
      else if (n === 0) console.log('VERDICT: the tracker started and gives no result. Look for errors in the console below.');
      else if (b.tracker.faces === 0) console.log(`VERDICT: the tracker runs on ${b.tracker.delegate} and finds no face. Hold a face in front of the camera and run again.`);
      else console.log(`VERDICT: the tracker runs on ${b.tracker.delegate} and finds a face.`);
    }
    // The same message comes for every frame: print each message one time, with its count. Times and addresses of
    // memory differ per line, so they are taken out before the count.
    const seen = new Map();
    for (const l of logs) { const k = l.replace(/[EIW]\d{4} \d\d:\d\d:\d\d\.\d+ +\d+ /g, '').replace(/0x[0-9a-f]+/g, '0x..'); seen.set(k, (seen.get(k) ?? 0) + 1); }
    console.log('--- console:', logs.length, 'lines,', seen.size, 'different');
    for (const [l, n] of seen) console.log(`[${n}x] ${l.slice(0, 2500)}`);
  }
} finally {
  ws?.close(); // closes the link only, the page on the phone stays open
  unforward();
}
