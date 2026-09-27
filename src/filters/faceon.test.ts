import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { faceFrame, toFace, windows, coverScale, pickTarget, photoTarget, fitSize, TARGETS, FACEON, SPAN, type Frame } from './faceon';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { UV } from '../render/faceMesh';
import type { Handle } from './presets';

const A = 4 / 3;
// A face from the flat layout: centre (cx, cy), width w in x units, rolled by roll.
function face(cx = 0.5, cy = 0.5, w = 0.3, roll = 0): Float32Array {
  const lm = new Float32Array(478 * 3);
  const c = Math.cos(roll), s = Math.sin(roll);
  for (let i = 0; i < 468; i++) {
    const x = (UV[i * 2] - 0.5) * w, y = (0.5 - UV[i * 2 + 1]) * w;
    lm[i * 3] = cx + c * x - s * y;
    lm[i * 3 + 1] = cy + (s * x + c * y) * A;
  }
  return lm;
}
const mid = (ring: number[], lm: Float32Array, f: Frame) => {
  const q = ring.map((i) => toFace([lm[i * 3], lm[i * 3 + 1]], f, A));
  return [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length];
};

describe('face frame', () => {
  it('finds nose, width and roll', () => {
    const f = faceFrame(face(0.4, 0.6, 0.3, 0.2), A);
    expect(f.width).toBeCloseTo(0.3 * (UV[454 * 2] - UV[234 * 2]), 3);
    expect(f.roll).toBeCloseTo(0.2, 3);
    expect(f.nose[0]).toBeGreaterThan(0.35); expect(f.nose[0]).toBeLessThan(0.45);
  });
  it('face units do not change with roll, place or size', () => {
    const a = face(0.5, 0.5, 0.3, 0), b = face(0.3, 0.7, 0.18, -0.4);
    const fa = faceFrame(a, A), fb = faceFrame(b, A);
    for (const ring of [EYE_R, EYE_L, LIPS]) {
      const [ax, ay] = mid(ring, a, fa), [bx, by] = mid(ring, b, fb);
      expect(bx).toBeCloseTo(ax, 3); expect(by).toBeCloseTo(ay, 3);
    }
    expect(toFace(fa.nose, fa, A)).toEqual([0, 0]);
  });
});

describe('windows', () => {
  it('gives three windows: two eyes above the nose, the mouth below, all inside the quad', () => {
    const w = windows(face(), [], A);
    expect(w).toHaveLength(3);
    expect(w[0][0]).toBeLessThan(0); expect(w[1][0]).toBeGreaterThan(0);
    expect(w[0][1]).toBeLessThan(0); expect(w[1][1]).toBeLessThan(0); expect(w[2][1]).toBeGreaterThan(0);
    for (const [cx, cy, rx, ry] of w) {
      expect(rx).toBeGreaterThan(0); expect(ry).toBeGreaterThan(0);
      expect(Math.abs(cx) + rx).toBeLessThan(SPAN / 2); expect(Math.abs(cy) + ry).toBeLessThan(SPAN / 2);
    }
  });
  it('windows follow a filter: a magnifier on the head moves the eyes apart and makes them bigger', () => {
    const lm = face();
    const f = faceFrame(lm, A);
    const head: Handle = { cx: f.nose[0], cy: f.nose[1], r: 0.3, strength: 0.4, type: 0 };
    const plain = windows(lm, [], A), bigHead = windows(lm, [head], A);
    expect(bigHead[0][0]).toBeLessThan(plain[0][0]);
    expect(bigHead[1][0]).toBeGreaterThan(plain[1][0]);
    expect(bigHead[0][2]).toBeGreaterThan(plain[0][2]);
  });
  it('the mouth window grows when the mouth opens', () => {
    const shut = face(), open = face();
    for (const i of [17, 84, 181, 314, 405, 14, 87, 317]) open[i * 3 + 1] += 0.05; // lower lip down
    expect(windows(open, [], A)[2][3]).toBeGreaterThan(windows(shut, [], A)[2][3]);
  });
});

describe('cover fit', () => {
  it('fills the visible part of the stage with the picture, the unit is the picture width', () => {
    // canvas 640 x 480 on a tall screen 380 x 860: the screen shows a column 212 px wide and 480 high
    const [sx, sy] = coverScale(640, 480, 380, 860, 1280, 1280);
    expect((sx * 640) / 2).toBeCloseTo(480, 0); // the square picture is 480 canvas pixels wide: it covers the height
    expect((sy * 480) / 2).toBeCloseTo(480, 0); // and the same on y: pixels stay square
  });
  it('covers a wide view with a tall photo', () => {
    const [sx] = coverScale(1280, 720, 1280, 720, 600, 1200);
    expect((sx * 1280) / 2).toBeCloseTo(1280, 0); // width decides
  });
});

describe('targets', () => {
  it('have a picture and a chip on disk, and a face place inside the picture', () => {
    expect(TARGETS.map((t) => t.id)).toEqual(['orange', 'apple', 'cat', 'dog', 'lion']);
    for (const t of TARGETS) {
      expect(existsSync('public' + t.img), t.img).toBe(true);
      expect(existsSync('public' + t.chip), t.chip).toBe(true);
      expect(t.nose[0]).toBeGreaterThan(0.3); expect(t.nose[0]).toBeLessThan(0.7);
      expect(t.width).toBeGreaterThan(0.2); expect(t.width).toBeLessThan(0.6);
    }
    expect(FACEON[0].id).toBe('none');
    expect(FACEON.at(-1)!.id).toBe('photo');
  });
  it('a second tap turns the target off, a tap on photo always asks for a photo', () => {
    expect(pickTarget('none', 'cat')).toBe('cat');
    expect(pickTarget('cat', 'cat')).toBe('none');
    expect(pickTarget('cat', 'dog')).toBe('dog');
    expect(pickTarget('photo', 'photo')).toBe('photo');
  });
});

describe('device photo', () => {
  it('takes the place of eyes and mouth from the face in the photo', () => {
    const t = photoTarget('blob:x', face(0.4, 0.45, 0.3, 0.1), 1200, 900); // same aspect as A
    expect(t.id).toBe('photo');
    expect(t.nose[0]).toBeCloseTo(faceFrame(face(0.4, 0.45, 0.3, 0.1), A).nose[0], 4);
    expect(t.angle).toBeCloseTo(0.1, 3);
    expect(t.width).toBeGreaterThan(0.2);
  });
  it('photo without a face gets the middle', () => {
    const t = photoTarget('blob:x', null, 1200, 900);
    expect(t.nose).toEqual([0.5, 0.5]);
    expect(t.angle).toBe(0);
  });
  it('limits the size of a device photo', () => {
    expect(fitSize(4000, 3000)).toEqual([1536, 1152]);
    expect(fitSize(3000, 4000)).toEqual([1152, 1536]);
    expect(fitSize(800, 600)).toEqual([800, 600]);
  });
});
