// Headless smoke check with Chrome's fake camera. Not part of `npm test`.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173)
import { statSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, acceptDownloads: true });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const egress = [];
const own = new URL(url).hostname;
page.on('request', (r) => { if (new URL(r.url()).hostname !== own) egress.push(`request ${r.url()}`); });
page.on('requestfailed', (r) => { if (new URL(r.url()).hostname !== own) egress.push(`failed ${r.url()} ${r.failure()?.errorText}`); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.env.SMOKE_WAIT_MS ?? 4000));
const state = await page.evaluate(async () => {
  const v = document.querySelector('video');
  const c = document.querySelector('canvas');
  return {
    video: v ? { w: v.videoWidth, h: v.videoHeight, readyState: v.readyState, playing: !v.paused } : null,
    canvas: c ? { w: c.width, h: c.height } : null,
    buttons: [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    text: document.body.innerText.slice(0, 200),
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null,
    sw: await navigator.serviceWorker?.getRegistration().then((r) => r?.active?.state ?? 'none').catch(() => 'n/a'),
  };
});
console.log(JSON.stringify(state, null, 1));
const shutter = page.getByRole('button', { name: 'take photo' });
if (await shutter.count()) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), shutter.click()]);
  console.log('download:', dl.suggestedFilename(), statSync(await dl.path()).size, 'bytes');
}
console.log('--- third-party requests:', egress.length ? '' : 'none');
for (const e of egress) console.log(e);
console.log('--- console:');
for (const l of logs) console.log(l);
await browser.close();
