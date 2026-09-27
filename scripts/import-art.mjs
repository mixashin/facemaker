// Art from Astra (astra/out, not in git) to app files. Runs by hand after a delivery: node scripts/import-art.mjs targets
// Needs ffmpeg and ffprobe on PATH. The results are committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

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

const job = JOBS[process.argv[2]];
if (!job) { console.error('usage: node scripts/import-art.mjs', Object.keys(JOBS).join('|')); process.exit(1); }
if (!existsSync('astra/out')) { console.error('astra/out not found: run from the repo root, after a delivery'); process.exit(1); }
job();
