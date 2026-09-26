// Headless smoke check with Chrome's fake camera. Not part of `npm test`.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173)
// Env:
//   SMOKE_WAIT_MS   wait after load before reading state (default 4000)
//   FACE            image used as the camera feed (default test/face.png if present; converted to y4m with ffmpeg)
//   FACE_ROTATE     degrees to roll the face image (head-tilt check for sticker rotation)
//   SMOKE_OUT       directory for screenshots; enables the shot options below
//   SMOKE_SHOTS     "sticker,cat;warp,upsideDown": click each group's aria-labels in order, save <last label>.png of the canvas
//   SMOKE_PAGE      "theme,Blossom": click labels, save page-<last label>.png of the whole page, then close any open sheet
//   SMOKE_TEXT      "Čćžšđ 🐱": type it in text mode, save text.png of the canvas
//   SMOKE_GALLERY   1: take a photo, open the gallery, edit it with a sticker, save, expect one more photo
import { existsSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.env.SMOKE_OUT;
const face = process.env.FACE ?? (existsSync('test/face.png') ? 'test/face.png' : null);
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'];
if (face) {
  const y4m = join(mkdtempSync(join(tmpdir(), 'facemaker-')), 'face.y4m');
  const rot = Number(process.env.FACE_ROTATE ?? 0);
  const vf = rot ? `rotate=${rot}*PI/180:c=black,scale=640:480` : 'scale=640:480';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', face, '-t', '2', '-r', '15', '-vf', vf, '-pix_fmt', 'yuv420p', y4m]);
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
const offOrigin = (u) => { const p = new URL(u); return p.protocol !== 'blob:' && p.protocol !== 'data:' && p.hostname !== own; };
page.on('request', (r) => { if (offOrigin(r.url())) egress.push(`request ${r.url()}`); });
page.on('requestfailed', (r) => { if (offOrigin(r.url())) egress.push(`failed ${r.url()} ${r.failure()?.errorText}`); });
const downloads = [];
page.on('download', (d) => downloads.push(d));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.env.SMOKE_WAIT_MS ?? 4000));

const click = async (label) => {
  const el = page.locator(`[aria-label="${label}"]`).first();
  if ((await el.getAttribute('aria-selected')) === 'true') return; // tabs toggle: an open tab stays open
  await el.click(); await page.waitForTimeout(400);
};
const closeSheet = async () => { const c = page.locator('.close'); if (await c.count()) { await c.first().click(); await page.waitForTimeout(300); } };

// First launch: the tutorial covers the screen. Record it, then dismiss it.
const tutorial = page.locator('[role="dialog"][aria-label="tutorial"]');
const tutorialShown = (await tutorial.count()) > 0;
if (tutorialShown && out) writeFileSync(`${out}/page-tutorial.png`, await page.screenshot());
if (tutorialShown) await closeSheet();
console.log('tutorial on first launch:', tutorialShown ? 'shown' : 'not shown');
if (out) writeFileSync(`${out}/page-start.png`, await page.screenshot()); // the clean start screen

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

const shot = async (labels) => { for (const l of labels) await click(l); return page.locator('canvas').screenshot(); };

// Preset switch: the warped frame must differ from the plain one when a face is tracked.
if (state.fm?.faces > 0) {
  await click('warp'); // strips are closed by default
  const plain = await shot(['none']), eyes = await shot(['bigEyes']);
  let diff = 0; for (let i = 0; i < plain.length; i++) if (plain[i] !== eyes[i]) diff++;
  console.log('preset pixel diff (png bytes):', diff, diff > 0 ? 'OK' : 'FAIL');
  if (out) { writeFileSync(`${out}/none.png`, plain); writeFileSync(`${out}/bigEyes.png`, eyes); }
}
if (process.env.SMOKE_SHOTS && out) {
  for (const group of process.env.SMOKE_SHOTS.split(';')) {
    const labels = group.split(',').map((s) => s.trim()).filter(Boolean);
    writeFileSync(`${out}/${labels.at(-1)}.png`, await shot(labels));
    console.log('shot:', labels.join(' > '));
  }
}
if (process.env.SMOKE_PAGE && out) {
  const labels = process.env.SMOKE_PAGE.split(',').map((s) => s.trim()).filter(Boolean);
  for (const l of labels) await click(l);
  writeFileSync(`${out}/page-${labels.at(-1)}.png`, await page.screenshot());
  console.log('page shot:', labels.join(' > '));
  await closeSheet();
}
if (process.env.SMOKE_TEXT && out) {
  await click('text');
  await page.locator('input.textin').fill(process.env.SMOKE_TEXT);
  await page.waitForTimeout(500);
  writeFileSync(`${out}/text.png`, await page.locator('canvas').screenshot());
  console.log('shot: text');
  await page.locator('canvas').click({ position: { x: 400, y: 120 } });
  await page.waitForTimeout(300);
  const editorOpen = await page.locator('input.textin').count();
  console.log('tap on the video closes the text box:', editorOpen === 0 ? 'OK' : 'FAIL');
}

// SMOKE_GALLERY=1: take a photo, open the gallery, edit it with a sticker, save, expect two photos
if (process.env.SMOKE_GALLERY) {
  await page.getByRole('button', { name: 'take photo' }).click();
  await page.waitForTimeout(1500);
  await click('gallery');
  const before = await page.locator('.thumb').count();
  if (out) writeFileSync(`${out}/page-gallery.png`, await page.screenshot());
  await page.locator('.thumb').first().click(); await page.waitForTimeout(600);
  await click('Edit');
  await page.waitForTimeout(800);
  await click('moustache'); await page.waitForTimeout(400);
  if (out) writeFileSync(`${out}/page-editor.png`, await page.screenshot());
  await closeSheet(); // editor -> viewer (Playwright fails here if the button is covered)
  await closeSheet(); // viewer -> gallery
  const backInGallery = (await page.locator('.viewer, .editor').count()) === 0 && (await page.locator('.gallery').count()) === 1;
  console.log('close buttons in viewer and editor:', backInGallery ? 'OK' : 'FAIL');
  await page.locator('.thumb').first().click(); await page.waitForTimeout(600);
  await click('Edit'); await page.waitForTimeout(800);
  await click('moustache'); await page.waitForTimeout(400);
  await click('Save as new photo'); await page.waitForTimeout(1200);
  const after = await page.locator('.thumb').count();
  console.log('gallery photos before/after edit:', before, after, before >= 1 && after === before + 1 ? 'OK' : 'FAIL');
  await closeSheet();
}
// Shutter: a double tap must produce exactly one file.
const shutter = page.getByRole('button', { name: 'take photo' });
if (await shutter.count()) {
  const before = downloads.length;
  await shutter.dblclick({ delay: 30 });
  await page.waitForTimeout(3000);
  for (const d of downloads.slice(before)) console.log('download:', d.suggestedFilename(), statSync(await d.path()).size, 'bytes');
  const made = downloads.length - before;
  console.log('downloads after double tap:', made, made === 1 ? 'OK' : 'FAIL');
}
console.log('--- third-party requests:', egress.length ? '' : 'none');
for (const e of egress) console.log(e);
console.log('--- console:');
for (const l of logs) console.log(l);
await browser.close();
