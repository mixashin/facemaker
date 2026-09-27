// Headless smoke check with Chrome's fake camera. Not part of `npm test`.
// Usage: node scripts/smoke.mjs [url]   (default http://localhost:5173)
// Env:
//   SMOKE_WAIT_MS   wait after load before reading state (default 4000)
//   FACE            image used as the camera feed (default test/face.png if present; converted to y4m with ffmpeg)
//   FACE_ROTATE     degrees to roll the face image (head-tilt check for sticker rotation)
//   FACE_FIT        "crop": cut the face image to 4:3 (true proportions). Default: stretch it to 640x480
//   SMOKE_OUT       directory for screenshots; enables the shot options below
//   SMOKE_SHOTS     "sticker,cat;warp,upsideDown": click each group's aria-labels in order, save <last label>.png of the canvas; a label "-" closes the dock before the shot
//   SMOKE_PAGE      "theme,Blossom": click labels, save page-<last label>.png of the whole page, then close any open sheet
//   SMOKE_TEXT      "Čćžšđ 🐱": type it in text mode, save text.png of the canvas
//   SMOKE_GALLERY   1: take a photo, open the gallery, edit it with a sticker, save, expect one more photo
//   SMOKE_VIEWPORT  "412x915": browser viewport (default 800x600)
//   SMOKE_RECORD    1: pick a makeup look and the robot voice, hold the shutter 2.5 s, expect one video in the gallery with a video and an audio stream
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
  const size = process.env.FACE_FIT === 'crop' ? 'scale=640:480:force_original_aspect_ratio=increase,crop=640:480' : 'scale=640:480';
  const vf = rot ? `rotate=${rot}*PI/180:c=black,${size}` : size;
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

const RAIL = new Set(['warp', 'sticker', 'makeup', 'faceon', 'scene', 'text', 'voice', 'lab']);
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
  // Stickers are part of the picture: a warp moves and scales them with the face.
  // Hearts sit on the eyes. With big head and big eyes on, the red area must grow (it stayed the same before).
  const redPixels = () => page.evaluate(() => {
    const src = document.querySelector('canvas.stage');
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] < 110) n++;
    return n;
  });
  await click('hearts'); await click('warp'); await click('none'); await page.waitForTimeout(600);
  const red0 = await redPixels();
  await click('bigHead'); await click('bigEyes'); await page.waitForTimeout(600);
  const red1 = await redPixels();
  console.log('stickers follow the warp: heart pixels', red0, 'with big head and big eyes', red1, 'ratio', (red1 / Math.max(1, red0)).toFixed(2), red0 > 50 && red1 > red0 * 1.3 ? 'OK' : 'FAIL');
  await click('none'); await click('sticker'); await click('none');
  // Makeup: a look paints the face, follows the warp, and works together with a filter and a sticker.
  const tinted = (test) => page.evaluate((body) => {
    const hit = new Function('r', 'g', 'b', `return ${body};`);
    const src = document.querySelector('canvas.stage');
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (hit(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, test);
  const RED = 'r > 120 && g < 70 && b < 90';
  await click('warp'); await click('none');
  await click('makeup'); await click('none'); await page.waitForTimeout(500);
  const bareFace = await shot([]);
  const lip0 = await tinted(RED);
  const glam = await shot(['glam']);
  const lip1 = await tinted(RED);
  console.log('makeup paints the lips: red pixels', lip0, 'with the look', lip1, lip1 > lip0 + 150 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/glam.png`, glam);
  await click('warp'); await click('bigMouth'); await page.waitForTimeout(600);
  const lip2 = await tinted(RED);
  console.log('makeup follows the warp: red pixels', lip1, 'with big mouth', lip2, 'ratio', (lip2 / Math.max(1, lip1)).toFixed(2), lip2 > lip1 * 1.3 ? 'OK' : 'FAIL');
  await click('sticker'); await click('crown'); await page.waitForTimeout(600);
  const lip3 = await tinted(RED); // the look, the filter and the sticker together. tinted reads the stage, not the page
  if (out) writeFileSync(`${out}/glam-combo.png`, await page.locator('canvas').screenshot());
  await click('makeup');
  const on = await pressed();
  await click('glam'); await page.waitForTimeout(500); // second tap: off. The filter and the sticker stay on
  const off = await pressed();
  const lip4 = await tinted(RED);
  console.log('look with filter and sticker:', on.join('+'), 'red pixels', lip3, '| second tap:', off.join('+'), 'red pixels', lip4, on[0] === 'glam' && off[0] === 'none' && lip3 - lip4 > lip1 * 0.8 ? 'OK' : 'FAIL'); // the sticker has red of its own: the look must add its share
  await click('sticker'); await click('none'); await click('warp'); await click('none'); await page.waitForTimeout(500);
  const red3 = await tinted(RED);
  console.log('no look, no trace: red pixels as before', lip0, red3, Math.abs(red3 - lip0) <= Math.max(20, lip0 * 0.1) ? 'OK' : 'FAIL');
  if (out) { writeFileSync(`${out}/makeup-none-before.png`, bareFace); writeFileSync(`${out}/makeup-none-after.png`, await shot([])); }
  // Face on a picture: the orange fills the screen, the live eyes and mouth sit on it, filters still work.
  const ORANGE = 'r > 200 && g > 90 && g < 170 && b < 80';
  await click('faceon'); await click('none'); await page.waitForTimeout(400);
  const o0 = await tinted(ORANGE);
  await click('orange'); await page.waitForTimeout(1200); // the picture loads
  const o1 = await tinted(ORANGE);
  console.log('face on a picture: orange pixels', o0, 'with the orange', o1, o1 > o0 + 20000 ? 'OK' : 'FAIL');
  await click('warp'); await click('bigEyes'); await page.waitForTimeout(600);
  const o2 = await tinted(ORANGE);
  console.log('filters work on the picture: orange pixels', o1, 'with big eyes', o2, o2 < o1 - 300 ? 'OK' : 'FAIL');
  await click('none'); await click('faceon'); await click('orange'); await page.waitForTimeout(500); // second tap: off
  const o3 = await tinted(ORANGE);
  console.log('second tap brings the camera back: orange pixels', o3, Math.abs(o3 - o0) < 500 ? 'OK' : 'FAIL');
  // A place behind the person. The check brings its own scene (a picture of the app), so it runs before the art is in.
  {
    const probe = (x, y) => page.evaluate(([x, y]) => {
      const src = document.querySelector('canvas.stage');
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      return [...g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data].slice(0, 3);
    }, [x, y]);
    const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const faceAt = await page.evaluate(() => globalThis.__fm.nose?.() ?? [0.5, 0.5]);
    const noseX = 1 - faceAt[0]; // the front camera view is mirrored
    const EDGE = [[0.03, 0.03], [0.97, 0.03], [0.03, 0.5], [0.97, 0.5]]; // the person is in the middle: the room shows at the sides
    const edges = () => Promise.all(EDGE.map(([x, y]) => probe(x, y)));
    const most = (a, b) => Math.max(...a.map((v, i) => far(v, b[i])));
    const moved = (a, b) => a.filter((v, i) => far(v, b[i]) > 60).length;
    const cheek0 = await probe(noseX, faceAt[1] - 0.04), top0 = await edges(), over0 = await probe(noseX, 0.02), chest0 = await probe(noseX, 0.97);
    await page.evaluate(() => globalThis.__fm.scene({ id: 'check', icon: 'x', plate: '/targets/apple.webp' }));
    await page.waitForTimeout(4000); // second worker, model, first masks
    const m0 = await page.evaluate(() => globalThis.__fm.masks);
    await page.waitForTimeout(2000);
    const m1 = await page.evaluate(() => globalThis.__fm.masks);
    const cheek1 = await probe(noseX, faceAt[1] - 0.04), top1 = await edges(), over1 = await probe(noseX, 0.02), chest1 = await probe(noseX, 0.97);
    const size = await page.evaluate(() => globalThis.__fm.mask);
    console.log('place behind the person: masks per second', ((m1 - m0) / 2).toFixed(1), 'mask size', size.join('x'), (m1 - m0) / 2 > 5 && Math.max(...size) === 256 ? 'OK' : 'FAIL');
    // A mask that is upside down keeps the pixel above the head and loses the chest: both are checked
    console.log('the person stays, the background goes: face moved by', far(cheek0, cheek1), 'chest by', far(chest0, chest1), '| above the head by', far(over0, over1), 'edges that changed', moved(top0, top1), 'of 4',
      far(cheek0, cheek1) < 40 && far(chest0, chest1) < 40 && far(over0, over1) > 25 && moved(top0, top1) >= 3 ? 'OK' : 'FAIL (needs a test picture with room around the person)');
    if (out) writeFileSync(`${out}/scene.png`, await page.locator('canvas').screenshot());
    await page.evaluate(() => globalThis.__fm.scene(null));
    await page.waitForTimeout(800);
    const top2 = await edges();
    const m2 = await page.evaluate(() => globalThis.__fm.masks);
    await page.waitForTimeout(1500);
    const m3 = await page.evaluate(() => globalThis.__fm.masks);
    console.log('place off: the camera picture is back', most(top0, top2) < 12, '| the segmenter rests', m3 === m2, most(top0, top2) < 12 && m3 === m2 ? 'OK' : 'FAIL');
    // Ten times on and off: every start makes a new worker. Masks and face tracking must still run after that.
    for (let i = 0; i < 10; i++) { await page.evaluate(() => globalThis.__fm.scene({ id: 'check', icon: 'x', plate: '/targets/apple.webp' })); await page.waitForTimeout(500); await page.evaluate(() => globalThis.__fm.scene(null)); await page.waitForTimeout(200); }
    await page.evaluate(() => globalThis.__fm.scene({ id: 'check', icon: 'x', plate: '/targets/apple.webp' }));
    await page.waitForTimeout(4000);
    const c0 = await page.evaluate(() => [globalThis.__fm.masks, globalThis.__fm.frames]);
    await page.waitForTimeout(1500);
    const c1 = await page.evaluate(() => [globalThis.__fm.masks, globalThis.__fm.frames]);
    console.log('ten times on and off: masks', c1[0] - c0[0], 'tracker frames', c1[1] - c0[1], c1[0] > c0[0] && c1[1] > c0[1] ? 'OK' : 'FAIL');
    await page.evaluate(() => globalThis.__fm.scene(null));
    await page.waitForTimeout(500);
  }
  // A photo from the device as the picture. The face in it is found on the device.
  if (face) {
    const camera = await tinted('r + g + b > 600');
    await page.locator('input[type=file][aria-label="photo file"]').setInputFiles(face);
    await page.waitForTimeout(6000); // second face model on the CPU, then the picture loads
    const tgt = await page.evaluate(() => globalThis.__fm?.target?.());
    const p = tgt?.photo;
    const found = !!p && (p.nose[0] !== 0.5 || p.nose[1] !== 0.5);
    console.log('device photo:', tgt?.id, 'face in the photo', found ? `at ${p.nose.map((v) => v.toFixed(2)).join(',')} width ${p.width.toFixed(2)}` : 'not found', '| local url', String(p?.img).slice(0, 5), tgt?.id === 'photo' && found && String(p.img).startsWith('blob:') ? 'OK' : 'FAIL');
    const bright = await tinted('r + g + b > 600');
    console.log('the photo takes the place of the camera view: bright pixels', camera, bright, camera !== bright ? 'OK' : 'FAIL');
    if (out) writeFileSync(`${out}/faceon-photo.png`, await shot(['-']));
    // Many photos in a row: the face search keeps one model, and the live tracker keeps its place on the GPU.
    for (let i = 0; i < 8; i++) { await page.locator('input[type=file][aria-label="photo file"]').setInputFiles(face); await page.waitForTimeout(700); }
    await page.waitForTimeout(2500);
    const f0 = await page.evaluate(() => globalThis.__fm.frames);
    await page.waitForTimeout(1500);
    const f1 = await page.evaluate(() => globalThis.__fm.frames);
    const again = (await page.evaluate(() => globalThis.__fm?.target?.()))?.photo;
    console.log('eight more photos: tracker frames', f0, f1, '| face in the last photo', !!again && again.nose[0] !== 0.5, f1 > f0 && !!again && again.nose[0] !== 0.5 ? 'OK' : 'FAIL');
    await click('faceon'); await click('none');
  }
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
  await click('makeup'); await click('none'); await click('glam'); // the clip is recorded with a look on
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
