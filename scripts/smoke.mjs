// Headless smoke check with Chrome's fake camera. Not part of `npm test`.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173)
// Env: SMOKE_WAIT_MS (default 4000), FACE=path/to/face.png (default test/face.png if present; converted to y4m with ffmpeg)
import { existsSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const face = process.env.FACE ?? (existsSync('test/face.png') ? 'test/face.png' : null);
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'];
if (face) {
  const y4m = join(mkdtempSync(join(tmpdir(), 'facemaker-')), 'face.y4m');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', face, '-t', '2', '-r', '15', '-vf', 'scale=640:480', '-pix_fmt', 'yuv420p', y4m]);
  args.push(`--use-file-for-fake-video-capture=${y4m}`);
  console.log('face feed:', face);
}
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, acceptDownloads: true });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const egress = [];
const own = new URL(url).hostname;
page.on('request', (r) => { if (new URL(r.url()).hostname !== own) egress.push(`request ${r.url()}`); });
page.on('requestfailed', (r) => { if (new URL(r.url()).hostname !== own) egress.push(`failed ${r.url()} ${r.failure()?.errorText}`); });
const downloads = [];
page.on('download', (d) => downloads.push(d));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.env.SMOKE_WAIT_MS ?? 4000));
const state = await page.evaluate(async () => {
  const v = document.querySelector('video');
  const c = document.querySelector('canvas');
  return {
    video: v ? { w: v.videoWidth, h: v.videoHeight, readyState: v.readyState, playing: !v.paused } : null,
    canvas: c ? { w: c.width, h: c.height } : null,
    buttons: [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    fm: globalThis.__fm ?? null,
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null,
    sw: await navigator.serviceWorker?.getRegistration().then((r) => r?.active?.state ?? 'none').catch(() => 'n/a'),
  };
});
console.log(JSON.stringify(state));
// Preset switch: the warped frame must differ from the plain one when a face is tracked.
const shot = async (labels) => {
  for (const l of labels) { await page.locator(`[aria-label="${l}"]`).first().click(); await page.waitForTimeout(400); } // chips, tabs and picker buttons all carry aria-label
  return page.locator('canvas').screenshot();
};
if (state.fm?.faces > 0) {
  const plain = await shot(['none']), eyes = await shot(['bigEyes']);
  let diff = 0; for (let i = 0; i < plain.length; i++) if (plain[i] !== eyes[i]) diff++;
  console.log('preset pixel diff (png bytes):', diff, diff > 0 ? 'OK' : 'FAIL');
  if (process.env.SMOKE_OUT) { const { writeFileSync } = await import('node:fs'); writeFileSync(`${process.env.SMOKE_OUT}/none.png`, plain); writeFileSync(`${process.env.SMOKE_OUT}/bigEyes.png`, eyes); }
}
// SMOKE_SHOTS="sticker,cat;warp,upsideDown": click each group's labels in order, save <last label>.png
if (process.env.SMOKE_SHOTS && process.env.SMOKE_OUT) {
  const { writeFileSync } = await import('node:fs');
  for (const group of process.env.SMOKE_SHOTS.split(';')) {
    const labels = group.split(',').map((s) => s.trim()).filter(Boolean);
    writeFileSync(`${process.env.SMOKE_OUT}/${labels.at(-1)}.png`, await shot(labels));
    console.log('shot:', labels.join(' > '));
  }
}
// SMOKE_PAGE="theme,Blossom": click labels, then save a full page screenshot as page-<last label>.png
if (process.env.SMOKE_PAGE && process.env.SMOKE_OUT) {
  const { writeFileSync } = await import('node:fs');
  const labels = process.env.SMOKE_PAGE.split(',').map((s) => s.trim()).filter(Boolean);
  for (const l of labels) { await page.locator(`[aria-label="${l}"]`).first().click(); await page.waitForTimeout(400); }
  writeFileSync(`${process.env.SMOKE_OUT}/page-${labels.at(-1)}.png`, await page.screenshot());
  console.log('page shot:', labels.join(' > '));
}
// Shutter: a double tap must produce exactly one file.
const shutter = page.getByRole('button', { name: 'take photo' });
if (await shutter.count()) {
  await shutter.dblclick({ delay: 30 });
  await page.waitForTimeout(3000);
  for (const d of downloads) console.log('download:', d.suggestedFilename(), statSync(await d.path()).size, 'bytes');
  console.log('downloads after double tap:', downloads.length, downloads.length === 1 ? 'OK' : 'FAIL');
}
console.log('--- third-party requests:', egress.length ? '' : 'none');
for (const e of egress) console.log(e);
console.log('--- console:');
for (const l of logs) console.log(l);
await browser.close();
