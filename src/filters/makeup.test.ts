import { describe, it, expect } from 'vitest';
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
const lastErases = (ev: string[]) => { let n = 0; while (n < ev.length && ev[ev.length - 1 - n] === 'erase') n++; return n; };
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
    expect(LOOKS.map((l) => l.id)).toEqual(['none', 'glam', 'soft', 'rainbow', 'clown', 'zombie', 'vampire', 'tiger', 'butterfly', 'hero', 'cucumber']);
    expect(lookById('cucumber').eyes).toBe('covered');
    expect(LOOKS.filter((l) => l.eyes === 'covered').length).toBe(1);
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
  it('saves and restores the canvas state around every layer', () => {
    const r = recorder();
    paintLook(r.g, lookById('glam'), 256);
    const ops = r.ops();
    expect(ops.filter((o) => o === 'save').length).toBe(ops.filter((o) => o === 'restore').length);
    expect(ops.filter((o) => o === 'save').length).toBeGreaterThan(3);
  });
  it('keeps the openings free: erases the mouth and the eyes after the paint', () => {
    for (const look of LOOKS.slice(1)) {
      const r = recorder();
      paintLook(r.g, look, 256);
      const ev = events(r.calls);
      expect(ev.includes('paint'), look.id).toBe(true);
      expect(lastErases(ev), look.id).toBe(look.eyes === 'covered' ? 1 : 3);
    }
  });
  it('paints the skin mask: the face without eyes, brows and lips', () => {
    const r = recorder();
    paintSkin(r.g, 256);
    expect(events(r.calls)).toEqual(['paint', 'erase', 'erase', 'erase', 'erase', 'erase']);
  });
});
