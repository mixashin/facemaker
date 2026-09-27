// Headless smoke check with Chrome's fake camera. Not part of `npm test`.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173)
// Env:
//   SMOKE_WAIT_MS   wait after load before reading state (default 4000)
//   FACE            image used as the camera feed (default test/face.png if present; converted to y4m with ffmpeg)
//   FACE_ROTATE     degrees to roll the face image (head-tilt check for sticker rotation)
//   SMOKE_OUT       directory for screenshots; enables the shot options below
//   SMOKE_SHOTS     "sticker,cat;warp,upsideDown": click each group's aria-labels in order, save <last label>.png of the canvas; a label "-" closes the dock before the shot
//   SMOKE_PAGE      "theme,Blossom": click labels, save page-<last label>.png of the whole page, then close any open sheet
//   SMOKE_TEXT      "Čćžšđ 🐱": type it in text mode, save text.png of the canvas
//   SMOKE_GALLERY   1: take a photo, open the gallery, edit it with a sticker, save, expect one more photo
//   SMOKE_VIEWPORT  "412x915": browser viewport (default 800x600)
//   SMOKE_RECORD    1: pick the robot voice, hold the shutter 2.5 s, expect one video in the gallery with a video and an audio stream
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
const [vw, vh] = (process.env.SMOKE_VIEWPORT ?? '800x600').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, acceptDownloads: true });
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

const RAIL = new Set(['warp', 'sticker', 'text', 'voice', 'lab']);
const openDock = async () => { if ((await page.locator('.dock.open').count()) === 0) { await page.locator('[aria-label="effects"]').click(); await page.waitForTimeout(350); } };
const click = async (label) => {
  if (RAIL.has(label)) await openDock();
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

// A label "-" closes the dock, so the shot shows the whole picture.
const shot = async (labels) => {
  for (const l of labels) {
    if (l === '-') { await page.locator('canvas.stage').click({ position: { x: vw - 20, y: 120 } }); await page.waitForTimeout(400); }
    else await click(l);
  }
  return page.locator('canvas').screenshot();
};

// Preset switch: the warped frame must differ from the plain one when a face is tracked.
if (state.fm?.faces > 0) {
  await click('warp'); // strips are closed by default
  const plain = await shot(['none']), eyes = await shot(['bigEyes']);
  let diff = 0; for (let i = 0; i < plain.length; i++) if (plain[i] !== eyes[i]) diff++;
  console.log('preset pixel diff (png bytes):', diff, diff > 0 ? 'OK' : 'FAIL');
  if (out) { writeFileSync(`${out}/none.png`, plain); writeFileSync(`${out}/bigEyes.png`, eyes); }
  // Several filters at once: chips toggle, five at most, the oldest pick makes room.
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('.dock .chip[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label')));
  const combo = await shot(['bigMouth', 'bigHead']);
  const three = await pressed();
  let d2 = 0; for (let i = 0; i < eyes.length; i++) if (eyes[i] !== combo[i]) d2++;
  console.log('three filters at once:', three.join('+'), 'differs from one filter:', d2 > 0, three.length === 3 && d2 > 0 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/combo.png`, combo);
  for (const l of ['bigEars', 'noNose', 'doubleChin']) await click(l);
  const five = await pressed();
  console.log('limit of five:', five.join('+'), five.length === 5 && !five.includes('bigEyes') && five.includes('doubleChin') ? 'OK' : 'FAIL');
  await click('bigEars');
  const four = await pressed();
  await click('none');
  const zero = await pressed();
  console.log('a second tap turns one off, none clears all:', four.length, zero.join('+'), four.length === 4 && !four.includes('bigEars') && zero.length === 1 && zero[0] === 'none' ? 'OK' : 'FAIL');
  // Several stickers at once: props combine, a mask replaces a mask.
  await click('sticker'); await click('none');
  const bare = await shot([]);
  const dressed = await shot(['cat', 'crown', 'sunglasses']);
  const worn = await pressed();
  let d3 = 0; for (let i = 0; i < bare.length; i++) if (bare[i] !== dressed[i]) d3++;
  console.log('mask with two props:', worn.join('+'), 'changes the picture:', d3 > 0, worn.length === 3 && d3 > 0 ? 'OK' : 'FAIL');
  await click('dog');
  const swapped = await pressed();
  console.log('a mask replaces a mask, props stay:', swapped.join('+'), swapped.length === 3 && swapped.includes('dog') && !swapped.includes('cat') && swapped.includes('crown') && swapped.includes('sunglasses') ? 'OK' : 'FAIL');
  await click('none');
  const cleared = await pressed();
  console.log('none clears the stickers:', cleared.join('+'), cleared.length === 1 && cleared[0] === 'none' ? 'OK' : 'FAIL');
  await click('warp');
}
if (process.env.SMOKE_SHOTS && out) {
  for (const group of process.env.SMOKE_SHOTS.split(';')) {
    const labels = group.split(',').map((s) => s.trim()).filter(Boolean);
    writeFileSync(`${out}/${labels.filter((l) => l !== '-').at(-1)}.png`, await shot(labels));
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
  await page.locator('canvas').click({ position: { x: vw - 20, y: 120 } }); // right edge: outside the dock on every viewport
  await page.waitForTimeout(300);
  const dockStillOpen = await page.locator('.dock.open').count();
  console.log('tap on the video closes the dock:', dockStillOpen === 0 ? 'OK' : 'FAIL');
}

// SMOKE_GALLERY=1: take a photo, open the gallery, edit it with a sticker, save, expect two photos
if (process.env.SMOKE_GALLERY) {
  await page.getByRole('button', { name: 'take photo' }).click();
  await page.waitForTimeout(1500);
  await click('gallery');
  const before = await page.locator('.thumb').count();
  console.log('gallery thumbs after the shutter:', before);
  if (out) writeFileSync(`${out}/page-gallery.png`, await page.screenshot());
  await page.locator('.thumb').first().click(); await page.waitForTimeout(600);
  const dl0 = downloads.length;
  await click('Save'); await page.waitForTimeout(1500);
  console.log('viewer save downloads a file:', downloads.length === dl0 + 1 ? 'OK' : 'FAIL');
  if (downloads.length === dl0 + 1) {
    const { execFileSync } = await import('node:child_process');
    const dims = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', await downloads[dl0].path()]).toString().trim();
    const [pw, ph] = dims.split(',').map(Number);
    const stage = await page.evaluate(() => { const r = document.querySelector('canvas.stage').getBoundingClientRect(); return r.width / r.height; });
    console.log('saved photo', dims, 'aspect', (pw / ph).toFixed(3), 'screen', stage.toFixed(3), Math.abs(pw / ph - stage) < 0.03 ? 'OK' : 'FAIL');
  }
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
  await click('Done'); await click('Save as new photo'); await page.waitForTimeout(1200);
  const after = await page.locator('.thumb').count();
  console.log('gallery photos before/after edit:', before, after, before >= 1 && after === before + 1 ? 'OK' : 'FAIL');
  await closeSheet();
}
// SMOKE_RECORD=1: hold the shutter, expect a playable clip with sound (the fake device has a microphone)
if (process.env.SMOKE_RECORD) {
  const support = await page.evaluate(() => ['video/mp4;codecs="avc1.424028,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].map((t) => `${t}=${MediaRecorder.isTypeSupported(t)}`));
  console.log('recorder types:', support.join(' | '));
  const micNow = () => page.evaluate(() => globalThis.__fm?.mic?.() ?? 'n/a');
  const closeDock = async () => { await page.locator('canvas.stage').click({ position: { x: vw - 20, y: 120 } }); await page.waitForTimeout(300); };
  // The shout preset listens to the mic: on while it is picked, off a few seconds after.
  await click('warp'); await click('none'); await click('shout'); await page.waitForTimeout(1500);
  const micShout = await micNow();
  await click('none'); await closeDock(); await page.waitForTimeout(4000);
  const micNone = await micNow();
  console.log('mic with the shout preset:', micShout, '| a few seconds after it is off:', micNone, micShout === 'live' && micNone === 'idle' ? 'OK' : 'FAIL');
  await click('voice'); await click('robot');
  await page.waitForTimeout(800); // mic prompt (auto-accepted) and the audio graph
  const mic = await page.evaluate(() => document.querySelector('[aria-label="voice mirror"]') ? 'mirror button' : document.querySelector('.voice [role=status]') ? 'denied hint' : 'nothing');
  console.log('voice tab shows:', mic, mic === 'mirror button' ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/page-voice.png`, await page.screenshot());
  await closeDock();
  const clips0 = await page.evaluate(() => globalThis.__fm?.clips ?? 0);
  const box = await page.getByRole('button', { name: 'take photo' }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  const recUi = await page.evaluate(() => ({ rec: !!document.querySelector('.shutter.rec'), dock: !!document.querySelector('.dock'), gear: !!document.querySelector('[aria-label="settings"]'), mic: globalThis.__fm?.mic?.() }));
  console.log('while recording:', JSON.stringify(recUi), recUi.rec && !recUi.dock && !recUi.gear && recUi.mic === 'live' ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/page-recording.png`, await page.screenshot());
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const clips = (await page.evaluate(() => globalThis.__fm?.clips ?? 0)) - clips0;
  console.log('hold to record: saved clips', clips, clips === 1 ? 'OK' : 'FAIL');
  await click('gallery');
  const badge = await page.locator('.thumb .badge').count();
  const thumbImg = await page.locator('.thumb').first().locator('img').count();
  console.log('gallery shows a video badge:', badge >= 1 ? 'OK' : 'FAIL', '| video thumbnail image:', thumbImg === 1 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/page-gallery-video.png`, await page.screenshot());
  await page.locator('.thumb').first().click(); await page.waitForTimeout(1200);
  const playing = await page.evaluate(() => { const v = document.querySelector('video.full'); return v ? { w: v.videoWidth, h: v.videoHeight, err: v.error?.code ?? 0, edit: !!document.querySelector('[aria-label="Edit"]') } : null; });
  console.log('viewer video:', JSON.stringify(playing), playing && playing.w > 0 && playing.err === 0 && !playing.edit ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/page-video.png`, await page.screenshot());
  // Another app in front: the video must stop, and stay stopped on return.
  const bg = await page.evaluate(async () => {
    const v = document.querySelector('video.full');
    await v.play().catch(() => {});
    const before = v.paused;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const hidden = v.paused;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    return { before, hidden, back: v.paused };
  });
  console.log('video in the background:', JSON.stringify(bg), !bg.before && bg.hidden && bg.back ? 'OK' : 'FAIL');
  const dl0 = downloads.length;
  await click('Save'); await page.waitForTimeout(1500);
  if (downloads.length === dl0 + 1) {
    const path = await downloads[dl0].path();
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', path]).toString());
    const kinds = info.streams.map((st) => `${st.codec_type}:${st.codec_name}`).join(' ');
    const v = info.streams.find((st) => st.codec_type === 'video');
    const stage = await page.evaluate(() => { const r = document.querySelector('canvas.stage').getBoundingClientRect(); return r.width / r.height; });
    console.log('clip file:', downloads[dl0].suggestedFilename(), statSync(path).size, 'bytes,', kinds, 'duration', info.format?.duration ?? 'n/a');
    console.log('clip has video and audio:', /video:/.test(kinds) && /audio:/.test(kinds) ? 'OK' : 'FAIL');
    console.log('clip aspect', (v.width / v.height).toFixed(3), 'screen', stage.toFixed(3), Math.abs(v.width / v.height - stage) < 0.03 ? 'OK' : 'FAIL');
  } else console.log('viewer save downloads the clip: FAIL');
  await closeSheet(); await closeSheet();
  // Privacy page: the mic turns off a few seconds after the last use.
  await page.waitForTimeout(1000);
  const micIdle = await micNow();
  console.log('mic a few seconds after the recording:', micIdle, micIdle === 'idle' ? 'OK' : 'FAIL');
  // A slow tap is a photo, not a clip of a few frames.
  const n0 = await page.evaluate(() => ({ shots: globalThis.__fm.shots, clips: globalThis.__fm.clips }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const n1 = await page.evaluate(() => ({ shots: globalThis.__fm.shots, clips: globalThis.__fm.clips, rec: !!document.querySelector('.shutter.rec') }));
  console.log('slow tap (450 ms): photos', n1.shots - n0.shots, 'clips', n1.clips - n0.clips, n1.shots - n0.shots === 1 && n1.clips === n0.clips && !n1.rec ? 'OK' : 'FAIL');
  await page.waitForTimeout(3500);
  const micIdle2 = await micNow();
  console.log('mic a few seconds after the slow tap:', micIdle2, micIdle2 === 'idle' ? 'OK' : 'FAIL');
}
// Shutter: a double tap must produce exactly one file.
const shutter = page.getByRole('button', { name: 'take photo' });
if (await shutter.count()) {
  const before = downloads.length, shots0 = await page.evaluate(() => globalThis.__fm?.shots ?? 0);
  await shutter.dblclick({ delay: 30 });
  await page.waitForTimeout(3000);
  for (const d of downloads.slice(before)) console.log('download:', d.suggestedFilename(), statSync(await d.path()).size, 'bytes');
  const shots = (await page.evaluate(() => globalThis.__fm?.shots ?? 0)) - shots0;
  const made = downloads.length - before;
  console.log('double tap: saved shots', shots, 'downloads', made, shots + made === 1 ? 'OK' : 'FAIL');
}
if (out) writeFileSync(`${out}/page-end.png`, await page.screenshot()); // final state: gallery button shows the newest photo
console.log('--- third-party requests:', egress.length ? '' : 'none');
for (const e of egress) console.log(e);
console.log('--- console:');
for (const l of logs) console.log(l);
await browser.close();
