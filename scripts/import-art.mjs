// Art from Astra (astra/out, not in git) to app files. Runs by hand after a delivery: node scripts/import-art.mjs targets|facepaint|backgrounds
// Needs ffmpeg and ffprobe on PATH. The results are committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const probe = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', file]).toString().trim().split(',');
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
// File names follow the brief: lowercase letters, digits, hyphen. Every other file is named and left out.
function pngs(dir) {
  if (!existsSync(dir)) { console.error(dir, 'not found: no delivery for this request yet'); process.exit(1); }
  const all = readdirSync(dir).filter((n) => !/\.md$/i.test(n));
  const good = all.filter((n) => /^[a-z0-9-]+\.png$/.test(n) && !/-chip\.png$/.test(n)).sort();
  for (const n of all) if (!good.includes(n)) console.warn('left out (name or type not as in the brief):', n);
  return good;
}
const hasAlpha = (fmt) => /^(rgba|bgra|argb|abgr|ya|gbrap|pal8)/.test(fmt);

const JOBS = {
  // Face-on targets (brief R1): square, opaque. The generator made 1254 px, so 1280 px keeps every detail.
  targets() {
    const src = 'astra/out/R1-face-targets', dst = 'public/targets';
    mkdirSync(dst, { recursive: true });
    for (const f of pngs(src)) {
      const [w, h, fmt] = probe(`${src}/${f}`);
      if (w !== h || Number(w) < 1254) throw new Error(`${f}: ${w}x${h}, expected a square of 1254 px or more`);
      if (hasAlpha(fmt)) throw new Error(`${f}: ${fmt} has transparency, expected an opaque picture`);
      const id = f.replace(/\.png$/, '');
      ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=1280:1280:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', `${dst}/${id}.webp`);
      ffmpeg('-i', `${src}/${f}`, '-vf', 'crop=iw*0.56:ih*0.56,scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
      console.log('imported', id);
    }
  },
};

// Face paint in the flat face layout (brief R4): square, with transparency. The look list of the app is
// written new from all files in public/makeup, so a look stays when its source is gone from astra/out.
JOBS.facepaint = function () {
  const src = 'astra/out/R4-face-paint', dst = 'public/makeup';
  mkdirSync(dst, { recursive: true });
  for (const f of pngs(src)) {
    const [w, h, fmt] = probe(`${src}/${f}`);
    if (w !== h || Number(w) < 1024) throw new Error(`${f}: ${w}x${h}, expected a square of 1024 px or more`);
    if (!hasAlpha(fmt)) throw new Error(`${f}: ${fmt} has no transparency. Bare skin must be transparent`);
    const id = f.replace(/\.png$/, '');
    ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=1024:1024:flags=lanczos', '-c:v', 'libwebp', '-quality', '90', `${dst}/${id}.webp`);
    ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
    console.log('imported', id);
  }
  const names = readdirSync(dst).filter((n) => /^[a-z0-9-]+\.webp$/.test(n) && !/-chip\.webp$/.test(n)).map((n) => n.replace(/\.webp$/, '')).sort();
  const looks = names.map((n) => ({ id: `paint-${n}`, icon: '🎨', img: `/makeup/${n}.webp`, chip: `/makeup/${n}-chip.webp` }));
  writeFileSync('src/filters/paintLooks.json', JSON.stringify(looks, null, 2) + '\n');
  console.log('src/filters/paintLooks.json:', looks.length, 'looks');
};

// Background scenes (brief R2), form A: <scene>/plate.png (square, opaque), optional far.png and near.png (same
// size, with transparency), optional bits/<name>.png (small, with transparency). The scene list of the app is
// written new from all scenes in public/scenes.
JOBS.backgrounds = function () {
  const src = 'astra/out/R2-backgrounds', dst = 'public/scenes';
  if (!existsSync(src)) { console.error(src, 'not found: no delivery for this request yet'); process.exit(1); }
  const ok = (n) => /^[a-z0-9-]+$/.test(n);
  for (const scene of readdirSync(src).filter((n) => statSync(`${src}/${n}`).isDirectory()).sort()) {
    if (!ok(scene)) { console.warn('left out (folder name not as in the brief):', scene); continue; }
    const from = `${src}/${scene}`, to = `${dst}/${scene}`;
    if (!existsSync(`${from}/plate.png`)) { console.warn('left out (no plate.png):', scene); continue; }
    const [w, h, fmt] = probe(`${from}/plate.png`);
    if (w !== h || Number(w) < 1254) throw new Error(`${scene}/plate.png: ${w}x${h}, expected a square of 1254 px or more`);
    if (hasAlpha(fmt)) throw new Error(`${scene}/plate.png: ${fmt} has transparency, expected an opaque picture`);
    mkdirSync(`${to}/bits`, { recursive: true });
    ffmpeg('-i', `${from}/plate.png`, '-vf', 'scale=1280:1280:flags=lanczos', '-c:v', 'libwebp', '-quality', '80', `${to}/plate.webp`);
    // the chip shows the whole plate: the middle of a scene is empty on purpose (the child stands there)
    ffmpeg('-i', `${from}/plate.png`, '-vf', 'scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${to}/chip.webp`);
    for (const layer of ['far', 'near']) {
      if (!existsSync(`${from}/${layer}.png`)) continue;
      const [lw, lh, lfmt] = probe(`${from}/${layer}.png`);
      if (lw !== w || lh !== h) throw new Error(`${scene}/${layer}.png: ${lw}x${lh}, expected the size of the plate (${w}x${h})`);
      if (!hasAlpha(lfmt)) throw new Error(`${scene}/${layer}.png: ${lfmt} has no transparency`);
      ffmpeg('-i', `${from}/${layer}.png`, '-vf', 'scale=1280:1280:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${to}/${layer}.webp`);
    }
    if (existsSync(`${from}/bits`)) for (const f of pngs(`${from}/bits`)) {
      const [, , bfmt] = probe(`${from}/bits/${f}`);
      if (!hasAlpha(bfmt)) throw new Error(`${scene}/bits/${f}: ${bfmt} has no transparency`);
      ffmpeg('-i', `${from}/bits/${f}`, '-vf', 'scale=256:256:flags=lanczos', '-c:v', 'libwebp', '-quality', '88', `${to}/bits/${f.replace(/\.png$/, '.webp')}`);
    }
    if (existsSync(`${from}/loop.mp4`)) console.warn(scene, 'has a loop video: not handled yet, the plate is used');
    console.log('imported', scene);
  }
  const scenes = readdirSync(dst).filter((n) => ok(n) && existsSync(`${dst}/${n}/plate.webp`)).sort().map((id) => {
    const has = (f) => existsSync(`${dst}/${id}/${f}`);
    const bits = has('bits') ? readdirSync(`${dst}/${id}/bits`).filter((n) => /^[a-z0-9-]+\.webp$/.test(n)).sort().map((n) => n.replace(/\.webp$/, '')) : [];
    return { id, plate: `/scenes/${id}/plate.webp`, chip: `/scenes/${id}/chip.webp`, ...(has('far.webp') ? { far: `/scenes/${id}/far.webp` } : {}), ...(has('near.webp') ? { near: `/scenes/${id}/near.webp` } : {}), bits };
  });
  writeFileSync('src/filters/scenes.json', JSON.stringify(scenes, null, 2) + '\n');
  console.log('src/filters/scenes.json:', scenes.length, 'scenes');
};

const job = JOBS[process.argv[2]];
if (!job) { console.error('usage: node scripts/import-art.mjs', Object.keys(JOBS).join('|')); process.exit(1); }
if (!existsSync('astra/out')) { console.error('astra/out not found: run from the repo root, after a delivery'); process.exit(1); }
job();
