import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectGlb, inspectPart, pngs, cornerAlpha, checkRender, PART_REACH } from './import-art.mjs';

// A glTF 2.0 binary with a JSON chunk only: enough for the checks that read the JSON
function glb(json) {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = Buffer.from(text, 'utf8'), head = Buffer.alloc(20);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + body.length, 8);
  head.writeUInt32LE(body.length, 12); head.write('JSON', 16, 'ascii');
  return Buffer.concat([head, body]);
}
const plain = (more = {}) => ({
  asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ count: 4, min: [-0.5, 0, -0.25], max: [0.5, 0.5, 0.25] }, { count: 6 }],
  animations: [{ name: 'fly' }],
  ...more,
});

describe('inspectGlb', () => {
  it('gives the facts of a plain file', () => {
    expect(inspectGlb(glb(plain()))).toEqual({ triangles: 2, size: [1, 0.5, 0.5], centre: [0, 0.25, 0], clips: ['fly'] });
  });
  it('refuses a file that is not a glTF 2.0 binary', () => {
    expect(() => inspectGlb(Buffer.from('not a model, only text'))).toThrow(/not a glTF/);
  });
  it('refuses a file that names a file outside itself', () => {
    expect(() => inspectGlb(glb(plain({ buffers: [{ uri: 'https://example.com/a.bin' }] })))).toThrow(/outside itself/);
    expect(() => inspectGlb(glb(plain({ images: [{ uri: 'skin.png' }] })))).toThrow(/outside itself/);
  });
  it('refuses extensions', () => {
    expect(() => inspectGlb(glb(plain({ extensionsUsed: ['KHR_draco_mesh_compression'] })))).toThrow(/extensions/);
  });
  it('refuses a root with a scale', () => {
    expect(() => inspectGlb(glb(plain({ nodes: [{ mesh: 0, scale: [2, 2, 2] }] })))).toThrow(/apply the transforms/);
  });
  // The loader reads a picture in the file with fetch from a blob: address. The CSP of the app
  // (connect-src 'self') stops that in the production build only: the prop has no colours there.
  it('refuses pictures in the file, until the app can load them under its CSP', () => {
    expect(() => inspectGlb(glb(plain({ images: [{ bufferView: 0, mimeType: 'image/png' }] })))).toThrow(/pictures in the file/);
  });
});

describe('inspectGlb, what the loader of the app cannot show right', () => {
  it('refuses a skin: a copy of a model with a skin follows the bones of the first one', () => {
    expect(() => inspectGlb(glb(plain({ skins: [{ joints: [0] }] })))).toThrow(/skin/);
  });
  it('refuses an extension at any place of the file, named at the top or not', () => {
    expect(() => inspectGlb(glb(plain({ materials: [{ extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } }] })))).toThrow(/extensions/);
    expect(() => inspectGlb(glb(plain({ nodes: [{ mesh: 0, extensions: { KHR_lights_punctual: { light: 0 } } }] })))).toThrow(/extensions/);
  });
  it('accepts every 3D prop that ships, and the list of the app holds its facts', () => {
    const list = JSON.parse(readFileSync('src/filters/props3d.json', 'utf8'));
    const files = readdirSync('public/props3d').filter((n) => n.endsWith('.glb')).sort();
    expect(files).toEqual(list.map((p) => `${p.id}.glb`).sort());
    for (const p of list) expect({ id: p.id, ...inspectGlb(readFileSync(`public/props3d/${p.id}.glb`)) }, p.id).toEqual(p);
    expect(readdirSync('public/props3d').filter((n) => !n.endsWith('.glb')).sort()).toEqual(list.map((p) => `${p.id}-chip.webp`).sort());
  });
});

describe('pngs', () => {
  it('lists the files with a name as in the brief, and names every file that it leaves out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'facemaker-art-'));
    for (const n of ['pirate-hat.png', 'fly.png', 'Pirate_Hat.png', 'fly.jpg', 'cat-chip.png', 'DELIVERY.md']) writeFileSync(join(dir, n), '');
    expect(pngs(dir)).toEqual({ good: ['fly.png', 'pirate-hat.png'], left: ['Pirate_Hat.png', 'cat-chip.png', 'fly.jpg'] });
  });
});

const tools = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!tools)('cornerAlpha (needs ffmpeg)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facemaker-art-'));
  const make = (name, filter) => { const f = join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', f]); return f; };
  it('is 0 for a cut-out with clear corners', () => {
    // a red disc on nothing
    expect(cornerAlpha(make('disc.png', "color=c=red:s=64x64,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-32,Y-32),20),255,0)'"))).toBe(0);
  });
  it('is 255 for a picture that has the pixel format of a cut-out and a ground that covers all', () => {
    expect(cornerAlpha(make('full.png', 'color=c=red:s=64x64,format=rgba'))).toBe(255);
  });
  it('is 255 for a picture with no transparency at all', () => {
    expect(cornerAlpha(make('rgb.png', 'color=c=blue:s=64x64,format=rgb24'))).toBe(255);
  });
});

describe.skipIf(!tools)('checkRender: the render of a part, for its chip (needs ffmpeg)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facemaker-art-'));
  const make = (name, size) => { const f = join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=red:s=${size},format=rgba`, '-frames:v', '1', f]); return f; };
  it('takes a square picture that is large enough for a chip', () => {
    expect(() => checkRender(make('good.png', '1024x1024'))).not.toThrow();
    expect(() => checkRender(make('least.png', '160x160'))).not.toThrow();
  });
  it('refuses a picture that is not square, and one that is smaller than the chip', () => {
    expect(() => checkRender(make('wide.png', '1024x512'))).toThrow(/1024x512, expected a square/);
    expect(() => checkRender(make('small.png', '16x16'))).toThrow(/16x16, expected a square of 160 px or more/);
  });
  it('refuses a file that is no picture, and a file that is not there', () => {
    const text = join(dir, 'text.png');
    writeFileSync(text, 'this is no picture');
    expect(() => checkRender(text)).toThrow(/no picture/);
    expect(() => checkRender(join(dir, 'none.png'))).toThrow(/not found/);
  });
});

describe('inspectPart (a part of a costume, in the head frame)', () => {
  const part = (min, max, more = {}) => glb(plain({ accessors: [{ count: 4, min, max }, { count: 6 }], animations: [], ...more }));
  it('takes a part that lies around a head, of any size up to the reach', () => {
    expect(inspectPart(part([-1.03, -1.08, -1.14], [1.03, 1.95, 0.68]), 8000)).toMatchObject({ triangles: 2, size: [2.06, 3.03, 1.82] });
    expect(inspectPart(part([-0.18, -0.27, 0.39], [0.23, 0.25, 1.03]), 2000).centre).toEqual([0.025, -0.01, 0.71]);
  });
  it('refuses more triangles than the limit of the part', () => {
    expect(() => inspectPart(part([-1, -1, -1], [1, 1, 1]), 1)).toThrow(/2 triangles, the limit is 1/);
  });
  it('refuses a part that is not in the head frame: far from the head, or as small as a dot', () => {
    expect(PART_REACH).toBe(3);
    expect(() => inspectPart(part([-1, -1, -1], [1, 8, 1]), 8000)).toThrow(/head frame/);
    expect(() => inspectPart(part([40, 0, 0], [41, 1, 1]), 8000)).toThrow(/head frame/);
    expect(() => inspectPart(part([0, 0, 0], [0.01, 0.01, 0.01]), 8000)).toThrow(/head frame/);
  });
  it('refuses what every model is refused for, and clips', () => {
    expect(() => inspectPart(part([-1, -1, -1], [1, 1, 1], { skins: [{ joints: [0] }] }), 8000)).toThrow(/skin/);
    expect(() => inspectPart(part([-1, -1, -1], [1, 1, 1], { animations: [{ name: 'idle' }] }), 8000)).toThrow(/clips/);
  });
  it('accepts every part that ships, and the list of the app holds its facts', () => {
    const list = JSON.parse(readFileSync('src/filters/costumes.json', 'utf8'));
    expect(list.length).toBeGreaterThanOrEqual(1);
    const looks = JSON.parse(readFileSync('src/filters/paintLooks.json', 'utf8')).map((l) => l.id);
    for (const c of list) {
      expect(looks, c.id).toContain(c.look);
      expect(readdirSync(`public/costumes/${c.id}`).sort()).toEqual(c.parts.flatMap((p) => [`${p.id}.glb`, `${p.id}-chip.webp`]).sort());
      for (const p of c.parts) {
        const { id, file, chip, ...facts } = p;
        expect(file).toBe(`/costumes/${c.id}/${id}.glb`);
        expect(chip).toBe(`/costumes/${c.id}/${id}-chip.webp`); // the picture of the part for the photo editor
        expect(inspectGlb(readFileSync('public' + file)), id).toEqual(facts);
      }
    }
    expect(readdirSync('public/costumes').sort()).toEqual(list.map((c) => c.id).sort());
  });
});
