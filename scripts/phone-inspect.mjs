// Reads the state of facemaker on a phone over USB: tracker, GPU, service worker, caches, console.
// Needs: adb on PATH, USB debugging on, the phone attached, facemaker open on the phone (Chrome tab or installed app).
// Reads technical state only. It takes no picture and reads no photo.
//
//   node scripts/phone-inspect.mjs            # state of the open page
//   node scripts/phone-inspect.mjs reload     # loads the page again first, so the console holds the start of the tracker
//   PHONE_WAIT_MS=20000 PHONE_MATCH=localhost:5173 node scripts/phone-inspect.mjs reload
//   PHONE_TAP=🔁 node scripts/phone-inspect.mjs   # taps a button of the app first
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 9333;
const match = process.env.PHONE_MATCH ?? 'face.mxa.sh';
const wait = Number(process.env.PHONE_WAIT_MS ?? 12000);
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8' }).trim();

const devices = adb('devices').split(/\r?\n/).slice(1).filter((l) => /\tdevice$/.test(l));
if (!devices.length) { console.error('No phone. Attach it by USB, turn on USB debugging, accept the prompt on the phone. `adb devices` must list it as "device".'); process.exit(1); }
console.log('phone:', adb('shell', 'getprop', 'ro.product.model'), '| Android', adb('shell', 'getprop', 'ro.build.version.release'), '| chip', adb('shell', 'getprop', 'ro.soc.model') || adb('shell', 'getprop', 'ro.board.platform'));
adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');

let browser;
// Ctrl+C during the wait: the forward must go too
process.on('SIGINT', () => { try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* gone */ } process.exit(130); });
try {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  // The other tabs of the phone are private: count them, never print them
  const pages = targets.filter((t) => t.type === 'page');
  console.log('pages of the app:', pages.filter((t) => t.url.includes(match)).length, '| other pages (not read):', pages.filter((t) => !t.url.includes(match)).length);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes(match));
  if (!page) { console.error(`No open page with "${match}" in its address. Open facemaker on the phone and keep the screen on.`); process.exitCode = 1; }
  else {
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    if (process.argv[2] === 'reload') await page.reload({ waitUntil: 'load' });
    // PHONE_TAP=<text or aria-label of a button of the app>: taps it first (for example the retry button of the camera)
    if (process.env.PHONE_TAP) { const b = page.locator(`button:has-text("${process.env.PHONE_TAP}"), [aria-label="${process.env.PHONE_TAP}"]`).first(); if (await b.count()) { await b.evaluate((e) => e.click()); console.log('tapped', process.env.PHONE_TAP); } else console.log('no button', process.env.PHONE_TAP); }
    const read = () => page.evaluate(async () => {
      const fm = globalThis.__fm, v = document.querySelector('video');
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'on, renderer name hidden') : 'NOT AVAILABLE';
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // a phone has few WebGL contexts: give this one back
      const reg = await navigator.serviceWorker?.getRegistration();
      const caches_ = {};
      for (const k of await caches.keys()) caches_[k] = (await (await caches.open(k)).keys()).length;
      const ml = await caches.open('ml-assets').then((c) => c.keys()).then((ks) => ks.map((r) => new URL(r.url).pathname)).catch(() => []);
      return {
        address: location.href,
        inFront: document.visibilityState,
        installed: matchMedia('(display-mode: standalone)').matches,
        agent: navigator.userAgent,
        screen: `${innerWidth}x${innerHeight} @${devicePixelRatio}`,
        video: v ? `${v.videoWidth}x${v.videoHeight} readyState ${v.readyState} paused ${v.paused}` : 'no video element',
        tracker: fm ? { frames: fm.frames, faces: fm.faces, delegate: fm.delegate || 'not ready', masks: fm.masks } : 'no debug state (old copy of the app?)',
        health: fm?.health ? { ...fm.health } : 'this version of the app has no tracker health',
        version: document.querySelector('.version span')?.textContent ?? 'not on the screen (open the settings to see it)',
        webgl2: renderer,
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        serviceWorker: reg ? { active: reg.active?.state ?? null, waiting: !!reg.waiting, script: reg.active?.scriptURL } : 'none',
        caches: caches_,
        mlAssets: ml,
        onScreen: [...document.querySelectorAll('[role=dialog], [role=alertdialog], .big')].map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').slice(0, 60)),
        scripts: [...document.scripts].map((s) => s.src.split('/').pop()).filter(Boolean),
      };
    });
    await page.waitForTimeout(2500); // a tap or a new load can start the page again
    await page.waitForLoadState('load').catch(() => {});
    const a = await read().catch(() => page.waitForTimeout(2000).then(read));
    await page.waitForTimeout(wait);
    const b = await read();
    console.log(JSON.stringify(b, null, 2));
    if (typeof a.tracker === 'object' && typeof b.tracker === 'object') {
      const frames = b.tracker.frames - a.tracker.frames;
      console.log(`in ${wait / 1000} s: tracker results ${frames}, faces in the last result ${b.tracker.faces}`);
      if (b.tracker.delegate === 'not ready') console.log('VERDICT: the tracker did not start. Look for "tracker" errors in the console below.');
      else if (frames === 0) console.log('VERDICT: the tracker started and gives no result. Look for errors in the console below.');
      else if (b.tracker.faces === 0) console.log(`VERDICT: the tracker runs on ${b.tracker.delegate} and finds no face. Hold a face in front of the camera and run again. If it stays 0 with a face in view: the ${b.tracker.delegate} path fails on this phone.`);
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
  await browser?.close(); // closes the link only, the page on the phone stays open
  try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* the forward is gone with the cable */ }
}
