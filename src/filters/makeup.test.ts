import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { LOOKS, MAKEUP, OVAL, LIPS, MOUTH, EYE_R, EYE_L, BROW_R, BROW_L, lookById, pickLook, paintLook, paintSkin, toLayout, grown, type Layer, type Pt } from './makeup';

type Call = { op: string; args: unknown[] };
function recorder() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const g = new Proxy({}, {
    get: (_t, k: string) => (k in state ? state[k] : (...args: unknown[]) => { calls.push({ op: k, args }); return k === 'createRadialGradient' ? { addColorStop() {} } : undefined; }),
    set: (_t, k: string, v) => { state[k] = v; calls.push({ op: 'set ' + k, args: [v] }); return true; },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls, ops: () => calls.map((c) => c.op) };
}
// Each fill or stroke, as paint or as erase. restore() puts the blend mode back, as the canvas does.
function events(calls: Call[]): string[] {
  let mode = 'source-over';
  const out: string[] = [];
  for (const c of calls) {
    if (c.op === 'restore') mode = 'source-over';
    else if (c.op === 'set globalCompositeOperation') mode = String(c.args[0]);
    else if (c.op === 'fill' || c.op === 'stroke') out.push(mode === 'destination-out' ? 'erase' : 'paint');
  }
  return out;
}
const pts = (l: Layer): Pt[] => (l.kind === 'blob' ? l.at : l.kind === 'stroke' ? l.path : l.ring);

describe('rings', () => {
  const pairs = (c: { start: number; end: number }[]) => new Set(c.flatMap(({ start, end }) => [`${start}-${end}`, `${end}-${start}`]));
  const follows = (ring: number[], set: Set<string>) => ring.every((a, i) => set.has(`${a}-${ring[(i + 1) % ring.length]}`));
  it('follow the connections that MediaPipe ships', () => {
    const lips = pairs(FaceLandmarker.FACE_LANDMARKS_LIPS);
    expect(follows(LIPS, lips)).toBe(true);
    expect(follows(MOUTH, lips)).toBe(true);
    expect(follows(EYE_R, pairs(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE))).toBe(true);
    expect(follows(EYE_L, pairs(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE))).toBe(true);
    expect(follows(OVAL, pairs(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL))).toBe(true);
  });
  it('hold the brow points of MediaPipe', () => {
    const ids = (c: { start: number; end: number }[]) => new Set(c.flatMap(({ start, end }) => [start, end]));
    expect(new Set(BROW_R)).toEqual(ids(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW));
    expect(new Set(BROW_L)).toEqual(ids(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW));
  });
});

describe('layout', () => {
  it('puts a landmark at its place in the flat face, y down', () => {
    const [x, y] = toLayout(10); // top of the forehead
    expect(x).toBeCloseTo(0.5, 2); expect(y).toBeLessThan(0.2);
    expect(toLayout(152)[1]).toBeGreaterThan(0.9); // chin
    expect(toLayout([0.3, 0.7])).toEqual([0.3, 0.7]);
  });
  it('grows a ring about its centre, per axis, and shifts it', () => {
    const sq: Pt[] = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]];
    expect(grown(sq, 2)[0]).toEqual([expect.closeTo(0.3), expect.closeTo(0.3)]);
    expect(grown(sq, [1, 2], 0.1)[2]).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
    expect(grown(sq)[1]).toEqual([expect.closeTo(0.6), expect.closeTo(0.4)]);
  });
});

describe('looks', () => {
  it('start with none, have unique ids and one icon each', () => {
    expect(LOOKS[0].id).toBe('none');
    expect(LOOKS[0].layers).toEqual([]);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    for (const l of LOOKS) expect(l.icon.length).toBeGreaterThan(0);
    expect(MAKEUP.map((m) => m.id)).toEqual(LOOKS.map((l) => l.id));
    expect(lookById('glam').id).toBe('glam');
    expect(lookById('nope' as never).id).toBe('none');
  });
  it('use valid points, colours and amounts', () => {
    for (const look of LOOKS) {
      expect(look.smooth).toBeGreaterThanOrEqual(0); expect(look.smooth).toBeLessThanOrEqual(1);
      expect(look.flat ?? 0).toBeGreaterThanOrEqual(0); expect(look.flat ?? 0).toBeLessThanOrEqual(1);
      for (const l of look.layers) {
        if (l.kind !== 'erase') { expect(l.color, look.id).toMatch(/^#[0-9a-f]{6}$/); expect(l.alpha).toBeGreaterThan(0); expect(l.alpha).toBeLessThanOrEqual(1); }
        expect(pts(l).length, look.id).toBeGreaterThan(0);
        for (const p of pts(l)) {
          if (typeof p === 'number') { expect(Number.isInteger(p)).toBe(true); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(468); }
          else for (const v of p) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        }
      }
    }
  });
  it('has all eleven looks', () => {
    expect(LOOKS.slice(0, 11).map((l) => l.id)).toEqual(['none', 'glam', 'soft', 'rainbow', 'clown', 'zombie', 'vampire', 'tiger', 'butterfly', 'hero', 'cucumber']);
    expect(lookById('cucumber').eyes).toBe('covered');
    expect(lookById('cucumber').flat).toBeGreaterThan(0.5); // the slices hide the eyes: paint that ignores the light of the face
    expect(LOOKS.filter((l) => l.eyes === 'covered').length).toBe(1);
  });
  it('looks from a picture come after the built-in ones, with their files on disk', () => {
    const painted = LOOKS.slice(11);
    for (const l of painted) {
      expect(l.id, l.id).toMatch(/^paint-[a-z0-9-]+$/);
      expect(l.img, l.id).toMatch(/^\/makeup\/[a-z0-9-]+\.webp$/);
      expect(existsSync('public' + l.img), l.img).toBe(true);
      expect(existsSync('public' + l.chip), l.chip).toBe(true);
      expect(l.layers).toEqual([]);
    }
    expect(MAKEUP.slice(11).map((m) => m.img)).toEqual(painted.map((l) => l.chip)); // the chip shows the paint, not an emoji
    expect(LOOKS.filter((l) => !l.img).length).toBe(11);
  });
  it('a second tap turns the look off', () => {
    expect(pickLook('none', 'glam')).toBe('glam');
    expect(pickLook('glam', 'tiger')).toBe('tiger');
    expect(pickLook('glam', 'glam')).toBe('none');
    expect(pickLook('glam', 'none')).toBe('none');
  });
});

describe('painter', () => {
  it('clears the canvas and paints nothing for none', () => {
    const r = recorder();
    paintLook(r.g, lookById('none'), 512);
    expect(events(r.calls)).toEqual([]);
    expect(r.calls[0]).toEqual({ op: 'clearRect', args: [0, 0, 512, 512] });
  });
  it('paints a layer with its colour, alpha and blur, in canvas pixels', () => {
    const r = recorder();
    paintLook(r.g, { id: 'glam', icon: 'x', smooth: 0, eyes: 'covered', layers: [{ kind: 'fill', ring: [[0.25, 0.5], [0.5, 0.5], [0.5, 0.75]], color: '#ff0000', alpha: 0.5, blur: 0.01 }] }, 200);
    expect(r.calls).toContainEqual({ op: 'set globalAlpha', args: [0.5] });
    expect(r.calls).toContainEqual({ op: 'set filter', args: ['blur(2.0px)'] });
    expect(r.calls).toContainEqual({ op: 'set fillStyle', args: ['#ff0000'] });
    expect(r.calls).toContainEqual({ op: 'moveTo', args: [50, 100] });
    expect(r.calls).toContainEqual({ op: 'lineTo', args: [100, 150] });
  });
  it('paints a mirrored layer twice, the second time flipped about the middle', () => {
    const r = recorder();
    paintLook(r.g, { id: 'glam', icon: 'x', smooth: 0, eyes: 'covered', layers: [{ kind: 'blob', at: [[0.2, 0.5]], r: 0.1, hard: true, color: '#00ff00', alpha: 1, mirror: true }] }, 100);
    expect(r.calls).toContainEqual({ op: 'translate', args: [100, 0] });
    expect(r.calls).toContainEqual({ op: 'scale', args: [-1, 1] });
    expect(r.ops().filter((o) => o === 'arc').length).toBe(2);
  });
  it('puts the picture of a look on the canvas, full size, under its shapes', () => {
    const r = recorder();
    const picture = { width: 1024, height: 1024 } as unknown as CanvasImageSource;
    paintLook(r.g, { id: 'paint-x', icon: 'x', smooth: 0, img: '/makeup/x.webp', layers: [{ kind: 'blob', at: [4], r: 0.05, hard: true, color: '#ff0000', alpha: 1 }] }, 512, picture);
    const ops = r.ops();
    expect(r.calls).toContainEqual({ op: 'drawImage', args: [picture, 0, 0, 512, 512] });
    expect(ops.indexOf('clearRect')).toBeLessThan(ops.indexOf('drawImage'));
    expect(ops.indexOf('drawImage')).toBeLessThan(ops.indexOf('arc'));
  });
  it('paints no picture while the picture is on its way', () => {
    const r = recorder();
    paintLook(r.g, { id: 'paint-x', icon: 'x', smooth: 0, img: '/makeup/x.webp', layers: [] }, 512);
    expect(r.ops()).toEqual(['clearRect']);
  });
  it('saves and restores the canvas state around every layer', () => {
    const r = recorder();
    paintLook(r.g, lookById('glam'), 256);
    const ops = r.ops();
    expect(ops.filter((o) => o === 'save').length).toBe(ops.filter((o) => o === 'restore').length);
    expect(ops.filter((o) => o === 'save').length).toBeGreaterThan(3);
  });
  it('paints the layers of the look and nothing else (the mesh has holes for eyes and mouth)', () => {
    for (const look of LOOKS.slice(1)) {
      const r = recorder();
      paintLook(r.g, look, 256);
      const sides = look.layers.reduce((n, l) => n + (l.kind !== 'erase' && l.mirror ? 2 : 1), 0);
      expect(events(r.calls).length, look.id).toBe(sides);
    }
  });
  it('paints the skin mask: the face without eyes, brows and lips', () => {
    const r = recorder();
    paintSkin(r.g, 256);
    expect(events(r.calls)).toEqual(['paint', 'erase', 'erase', 'erase', 'erase', 'erase']);
  });
});
