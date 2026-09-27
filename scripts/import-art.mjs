// Art from Astra (astra/out, not in git) to app files. Runs by hand after a delivery: node scripts/import-art.mjs targets|facepaint|backgrounds|props|props3d|costumes
// Needs ffmpeg and ffprobe on PATH. The results are committed.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const probe = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', file]).toString().trim().split(',');
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
// File names follow the brief: lowercase letters, digits, hyphen. good: the files of the job. left: every
// other file (notes excepted). A job imports the good ones and ends with an error when a file was left out.
export function pngs(dir) {
  if (!existsSync(dir)) { console.error(dir, 'not found: no delivery for this request yet'); process.exit(1); }
  const all = readdirSync(dir).filter((n) => !/\.md$/i.test(n)).sort();
  const good = all.filter((n) => /^[a-z0-9-]+\.png$/.test(n) && !/-chip\.png$/.test(n));
  return { good, left: all.filter((n) => !good.includes(n)) };
}
function leftOut(left, imported) {
  console.log('imported', imported, 'files');
  if (!left.length) return;
  for (const n of left) console.error('LEFT OUT (name or type not as in the brief):', n);
  process.exitCode = 1;
}
const hasAlpha = (fmt) => /^(rgba|bgra|argb|abgr|ya|gbrap|pal8)/.test(fmt);
// The largest alpha of the four corner pixels. A cut-out has 0 there. The pixel format alone does not say it:
// a picture can have an alpha plane and a ground that covers all.
export function cornerAlpha(file) {
  const corners = 'format=rgba,split=4[a][b][c][d];[a]crop=1:1:0:0[a1];[b]crop=1:1:iw-1:0[b1];[c]crop=1:1:0:ih-1[c1];[d]crop=1:1:iw-1:ih-1[d1];[a1][b1][c1][d1]hstack=4';
  const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', corners, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return Math.max(px[3], px[7], px[11], px[15]);
}
const cutOut = (file, name) => { if (cornerAlpha(file) !== 0) throw new Error(`${name}: the corners are not transparent, expected a cut-out`); };
// The render of a 3D part, for its chip: a square picture, not smaller than the chip. ffprobe gives no error
// for a file that is no picture, it gives a size of 0.
export const CHIP_PX = 160;
export function checkRender(file) {
  if (!existsSync(file)) throw new Error(`${file}: not found`);
  let w = 0, h = 0;
  try { [w, h] = probe(file).map(Number); } catch { /* no picture */ }
  if (!(w > 0 && h > 0)) throw new Error(`${file}: no picture`);
  if (w !== h || w < CHIP_PX) throw new Error(`${file}: ${w}x${h}, expected a square of ${CHIP_PX} px or more`);
}

const JOBS = {
  // Face-on targets (brief R1): square, opaque. The generator made 1254 px, so 1280 px keeps every detail.
  targets() {
    const src = 'astra/out/R1-face-targets', dst = 'public/targets';
    mkdirSync(dst, { recursive: true });
    const { good, left } = pngs(src);
    for (const f of good) { // every file is checked before one is written: a bad file leaves no half result
      const [w, h, fmt] = probe(`${src}/${f}`);
      if (w !== h || Number(w) < 1254) throw new Error(`${f}: ${w}x${h}, expected a square of 1254 px or more`);
      if (hasAlpha(fmt)) throw new Error(`${f}: ${fmt} has transparency, expected an opaque picture`);
    }
    for (const f of good) {
      const id = f.replace(/\.png$/, '');
      ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=1280:1280:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', `${dst}/${id}.webp`);
      ffmpeg('-i', `${src}/${f}`, '-vf', 'crop=iw*0.56:ih*0.56,scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
      console.log('imported', id);
    }
    leftOut(left, good.length);
  },
};

// Face paint in the flat face layout (brief R4): square, with transparency. The look list of the app is
// written new from all files in public/makeup, so a look stays when its source is gone from astra/out.
JOBS.facepaint = function () {
  const src = 'astra/out/R4-face-paint', dst = 'public/makeup';
  mkdirSync(dst, { recursive: true });
  const { good, left } = pngs(src);
  for (const f of good) {
    const [w, h, fmt] = probe(`${src}/${f}`);
    if (w !== h || Number(w) < 1024) throw new Error(`${f}: ${w}x${h}, expected a square of 1024 px or more`);
    if (!hasAlpha(fmt)) throw new Error(`${f}: ${fmt} has no transparency. Bare skin must be transparent`);
    cutOut(`${src}/${f}`, f); // the corners of the flat face layout are outside the face
  }
  for (const f of good) {
    const id = f.replace(/\.png$/, '');
    ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=1024:1024:flags=lanczos', '-c:v', 'libwebp', '-quality', '90', `${dst}/${id}.webp`);
    ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
    console.log('imported', id);
  }
  writeLooks();
  leftOut(left, good.length);
};
// The list of the painted looks, from all pictures in public/makeup
function writeLooks() {
  const names = readdirSync('public/makeup').filter((n) => /^[a-z0-9-]+\.webp$/.test(n) && !/-chip\.webp$/.test(n)).map((n) => n.replace(/\.webp$/, '')).sort();
  const looks = names.map((n) => ({ id: `paint-${n}`, icon: '🎨', img: `/makeup/${n}.webp`, chip: `/makeup/${n}-chip.webp` }));
  writeFileSync('src/filters/paintLooks.json', JSON.stringify(looks, null, 2) + '\n');
  console.log('src/filters/paintLooks.json:', looks.length, 'looks');
}

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
    if (existsSync(`${from}/bits`)) for (const f of pngs(`${from}/bits`).good) {
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

// Sticker props (brief R3): square, with transparency, one prop per file. For the photo editor and the live stickers.
JOBS.props = function () {
  const src = 'astra/out/R3-props', dst = 'public/props';
  mkdirSync(dst, { recursive: true });
  const { good, left } = pngs(src);
  for (const f of good) {
    const [w, h, fmt] = probe(`${src}/${f}`);
    if (w !== h || Number(w) < 512) throw new Error(`${f}: ${w}x${h}, expected a square of 512 px or more`);
    if (!hasAlpha(fmt)) throw new Error(`${f}: ${fmt} has no transparency`);
    cutOut(`${src}/${f}`, f);
  }
  for (const f of good) {
    ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=512:512:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', `${dst}/${f.replace(/\.png$/, '.webp')}`);
    console.log('imported', f.replace(/\.png$/, ''));
  }
  const names = readdirSync(dst).filter((n) => /^[a-z0-9-]+\.webp$/.test(n)).map((n) => n.replace(/\.webp$/, '')).sort();
  writeFileSync('src/filters/props.json', JSON.stringify(names, null, 2) + '\n');
  console.log('src/filters/props.json:', names.length, 'props');
  leftOut(left, good.length);
};

// What a .glb holds (glTF 2.0 binary): the facts that the brief asks for, and the things that the app refuses.
// A 3D file is data, but it can name files outside itself. The app makes zero third-party requests: refuse those.
export function inspectGlb(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 binary');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('length in the header does not match the file');
  if (bytes.toString('ascii', 16, 20) !== 'JSON') throw new Error('first chunk is not JSON');
  const g = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const outside = [...(g.buffers ?? []), ...(g.images ?? [])].filter((x) => x.uri !== undefined).map((x) => String(x.uri).slice(0, 40));
  if (outside.length) throw new Error('names a file outside itself: ' + outside.join(', '));
  const ext = [...new Set([...(g.extensionsUsed ?? []), ...(g.extensionsRequired ?? [])])];
  if (ext.length) throw new Error('uses extensions: ' + ext.join(', '));
  // The loader reads an `extensions` object in a material or a node with no look at the list at the top
  const deep = new Set();
  JSON.stringify(g, (key, value) => { if (key === 'extensions' && value && typeof value === 'object') Object.keys(value).forEach((k) => deep.add(k)); return value; });
  if (deep.size) throw new Error('uses extensions: ' + [...deep].join(', '));
  // A copy of a model with a skin shares the bones of the first one (the app makes one copy per face)
  if ((g.skins ?? []).length) throw new Error('has a skin (armature): move the parts as objects, as the brief says');
  // The loader reads a picture in the file with fetch from a blob: address. The CSP of the app (connect-src 'self')
  // stops that, in the production build only. The 11 props of delivery R5 have plain materials.
  if ((g.images ?? []).length) throw new Error('has pictures in the file (textures): the app cannot load them under its CSP yet');
  let triangles = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes ?? []) for (const p of m.primitives) {
    if ((p.mode ?? 4) !== 4) throw new Error('a mesh is not made of triangles');
    triangles += (p.indices !== undefined ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count) / 3;
  }
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? [];
  for (const r of roots) {
    const n = g.nodes[r], s = n.scale ?? [1, 1, 1], q = n.rotation ?? [0, 0, 0, 1];
    if (n.matrix || s.some((v) => Math.abs(v - 1) > 1e-4) || Math.abs(Math.abs(q[3]) - 1) > 1e-4) throw new Error('the root has a scale or a rotation: apply the transforms');
  }
  // bounds of the rest pose. Children of the root can have a place of their own: follow the tree (translation and scale only, enough for a size check)
  const walk = (i, at, by) => {
    const n = g.nodes[i], t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1];
    const here = at.map((v, k) => v + t[k] * by[k]), size = by.map((v, k) => v * s[k]);
    if (n.mesh !== undefined) for (const p of g.meshes[n.mesh].primitives) {
      const a = g.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], here[k] + Math.min(a.min[k] * size[k], a.max[k] * size[k])); hi[k] = Math.max(hi[k], here[k] + Math.max(a.min[k] * size[k], a.max[k] * size[k])); }
    }
    for (const c of n.children ?? []) walk(c, here, size);
  };
  for (const r of roots) walk(r, [0, 0, 0], [1, 1, 1]);
  const clips = (g.animations ?? []).map((a) => a.name);
  // + 0: a JSON file has no minus zero
  return { triangles, size: hi.map((h, k) => Number((h - lo[k]).toFixed(3)) + 0), centre: hi.map((h, k) => Number(((h + lo[k]) / 2).toFixed(3)) + 0), clips };
}

// 3D props (brief R5): <name>.glb plus a render <name>.png for the chip.
JOBS.props3d = function () {
  const src = 'astra/out/R5-props-3d', dst = 'public/props3d';
  if (!existsSync(src)) { console.error(src, 'not found: no delivery for this request yet'); process.exit(1); }
  mkdirSync(dst, { recursive: true });
  const list = [];
  for (const f of readdirSync(src).filter((n) => /^[a-z0-9-]+\.glb$/.test(n)).sort()) {
    const id = f.replace(/\.glb$/, '');
    const facts = inspectGlb(readFileSync(`${src}/${f}`));
    if (facts.triangles > 5000) throw new Error(`${f}: ${facts.triangles} triangles, the limit is 5000`);
    if (Math.abs(Math.max(...facts.size) - 1) > 0.05) throw new Error(`${f}: largest side ${Math.max(...facts.size)}, expected 1`);
    if (statSync(`${src}/${f}`).size > 1.5 * 1024 * 1024) throw new Error(`${f}: larger than 1.5 MB`);
    if (!existsSync(`${src}/${id}.png`)) throw new Error(`${f}: no render ${id}.png for the chip`);
    copyFileSync(`${src}/${f}`, `${dst}/${f}`);
    ffmpeg('-i', `${src}/${id}.png`, '-vf', 'scale=160:160:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
    list.push({ id, ...facts });
    console.log('imported', id, facts.triangles, 'triangles', facts.clips.join(' ') || 'no clip');
  }
  writeFileSync('src/filters/props3d.json', JSON.stringify(list, null, 2) + '\n');
  console.log('src/filters/props3d.json:', list.length, 'props');
};

// Costumes (brief R7): one folder per costume with <id>-paint.png (face paint, as R4), <id>.png (the whole costume,
// for the chip) and the parts <id>-<part>.glb, each with a render <id>-<part>.png (the chip of the part in the
// photo editor). A part is in the head frame: origin between the sides of the face,
// one unit is the face width. So the rule "largest side 1" of the props does not hold here.
const COSTUMES = { witch: { src: 'astra/out/R7-witch', triangles: { 'witch-hat-hair': 8000, 'witch-nose': 2000 } } };
// A part must lie around a head: no point farther than this from the middle of the head, in face widths
export const PART_REACH = 3;
export function inspectPart(bytes, limit) {
  const facts = inspectGlb(bytes);
  if (facts.triangles > limit) throw new Error(`${facts.triangles} triangles, the limit is ${limit}`);
  if (facts.clips.length) throw new Error('has clips: a part of a costume has no motion of its own yet');
  const far = Math.max(...facts.centre.map((c, k) => Math.abs(c) + facts.size[k] / 2));
  if (far > PART_REACH) throw new Error(`reaches ${far.toFixed(2)} face widths from the middle of the head, the limit is ${PART_REACH}: is it in the head frame?`);
  if (Math.max(...facts.size) < 0.05) throw new Error('smaller than 0.05 face widths: is it in the head frame?');
  return facts;
}
JOBS.costumes = function () {
  const list = [], work = [];
  for (const [id, c] of Object.entries(COSTUMES)) { // every file is checked before one is written
    if (!existsSync(c.src)) { console.error(c.src, 'not found: no delivery for this costume yet'); process.exit(1); }
    const paint = `${c.src}/${id}-paint.png`, chip = `${c.src}/${id}.png`;
    for (const f of [paint, chip]) if (!existsSync(f)) throw new Error(`${f}: not found`);
    const [w, h, fmt] = probe(paint);
    if (w !== h || Number(w) < 1024) throw new Error(`${paint}: ${w}x${h}, expected a square of 1024 px or more`);
    if (!hasAlpha(fmt)) throw new Error(`${paint}: ${fmt} has no transparency. Bare skin must be transparent`);
    cutOut(paint, paint);
    const [cw, ch] = probe(chip);
    if (cw !== ch) throw new Error(`${chip}: ${cw}x${ch}, expected a square`);
    const parts = Object.keys(c.triangles).map((part) => {
      const file = `${c.src}/${part}.glb`;
      if (!existsSync(file)) throw new Error(`${file}: not found`);
      if (statSync(file).size > 1.5 * 1024 * 1024) throw new Error(`${file}: larger than 1.5 MB`);
      checkRender(`${c.src}/${part}.png`);
      try { return { id: part, file: `/costumes/${id}/${part}.glb`, chip: `/costumes/${id}/${part}-chip.webp`, ...inspectPart(readFileSync(file), c.triangles[part]) }; } catch (e) { throw new Error(`${file}: ${e.message}`); }
    });
    const other = readdirSync(c.src).filter((n) => /\.glb$/.test(n) && !parts.some((p) => `${p.id}.glb` === n));
    if (other.length) throw new Error(`${c.src}: parts that the job does not know: ${other.join(', ')}`);
    work.push({ id, c, paint, chip, parts });
  }
  for (const { id, c, paint, chip, parts } of work) {
    mkdirSync(`public/costumes/${id}`, { recursive: true });
    ffmpeg('-i', paint, '-vf', 'scale=1024:1024:flags=lanczos', '-c:v', 'libwebp', '-quality', '90', `public/makeup/${id}.webp`);
    ffmpeg('-i', chip, '-vf', 'scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `public/makeup/${id}-chip.webp`);
    for (const p of parts) {
      copyFileSync(`${c.src}/${p.id}.glb`, `public${p.file}`);
      ffmpeg('-i', `${c.src}/${p.id}.png`, '-vf', `scale=${CHIP_PX}:${CHIP_PX}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '85', `public${p.chip}`);
    }
    list.push({ id, look: `paint-${id}`, parts });
    console.log('imported costume', id, 'with', parts.map((p) => `${p.id} (${p.triangles} triangles)`).join(', '));
  }
  writeFileSync('src/filters/costumes.json', JSON.stringify(list, null, 2) + '\n');
  console.log('src/filters/costumes.json:', list.length, 'costumes');
  writeLooks();
};

if (import.meta.main) {
  const job = JOBS[process.argv[2]];
  if (!job) { console.error('usage: node scripts/import-art.mjs', Object.keys(JOBS).join('|')); process.exit(1); }
  if (!existsSync('astra/out')) { console.error('astra/out not found: run from the repo root, after a delivery'); process.exit(1); }
  job();
}
