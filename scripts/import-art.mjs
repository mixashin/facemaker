// Art from Astra (astra/out, not in git) to app files. Runs by hand after a delivery: node scripts/import-art.mjs targets
// Needs ffmpeg and ffprobe on PATH. The results are committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const probe = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', file]).toString().trim().split(',');
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const pngs = (dir) => readdirSync(dir).filter((n) => /^[a-z0-9-]+\.png$/.test(n)).sort();
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

const job = JOBS[process.argv[2]];
if (!job) { console.error('usage: node scripts/import-art.mjs', Object.keys(JOBS).join('|')); process.exit(1); }
if (!existsSync('astra/out')) { console.error('astra/out not found: run from the repo root, after a delivery'); process.exit(1); }
job();
