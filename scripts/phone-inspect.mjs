// Reads the state of facemaker on a phone over USB: tracker, GPU, service worker, caches, console.
// Needs: adb on PATH, USB debugging on, the phone attached, facemaker open on the phone (Chrome tab or installed app).
// Reads technical state only. It takes no picture and reads no photo.
//
//   node scripts/phone-inspect.mjs            # state of the open page
//   node scripts/phone-inspect.mjs reload     # loads the page again first, so the console holds the start of the tracker
//   PHONE_WAIT_MS=20000 PHONE_MATCH=localhost:5173 node scripts/phone-inspect.mjs reload
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
try {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  console.log('open pages:', targets.filter((t) => t.type === 'page').map((t) => t.url).join(' | ') || 'none');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes(match));
  if (!page) { console.error(`No open page with "${match}" in its address. Open facemaker on the phone and keep the screen on.`); process.exitCode = 1; }
  else {
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    if (process.argv[2] === 'reload') await page.reload({ waitUntil: 'load' });
    const read = () => page.evaluate(async () => {
      const fm = globalThis.__fm, v = document.querySelector('video');
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const reg = await navigator.serviceWorker?.getRegistration();
      const caches_ = {};
      for (const k of await caches.keys()) caches_[k] = (await (await caches.open(k)).keys()).length;
      const ml = await caches.open('ml-assets').then((c) => c.keys()).then((ks) => ks.map((r) => new URL(r.url).pathname)).catch(() => []);
      return {
        address: location.href,
        installed: matchMedia('(display-mode: standalone)').matches,
        agent: navigator.userAgent,
        screen: `${innerWidth}x${innerHeight} @${devicePixelRatio}`,
        video: v ? `${v.videoWidth}x${v.videoHeight} readyState ${v.readyState} paused ${v.paused}` : 'no video element',
        tracker: fm ? { frames: fm.frames, faces: fm.faces, delegate: fm.delegate || 'not ready', masks: fm.masks } : 'no debug state (old copy of the app?)',
        webgl2: gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'on, renderer name hidden') : 'NOT AVAILABLE',
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        serviceWorker: reg ? { active: reg.active?.state ?? null, waiting: !!reg.waiting, script: reg.active?.scriptURL } : 'none',
        caches: caches_,
        mlAssets: ml,
        scripts: [...document.scripts].map((s) => s.src.split('/').pop()).filter(Boolean),
      };
    });
    const a = await read();
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
    console.log('--- console:');
    for (const l of logs) console.log(l.slice(0, 400));
  }
} finally {
  await browser?.close(); // closes the link only, the page on the phone stays open
  try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* the forward is gone with the cable */ }
}
