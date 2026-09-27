import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { faceFrame, toFace, windows, coverScale, coverOffset, pickTarget, photoTarget, fitSize, TARGETS, FACEON, SPAN, SLOTS, SWING, type Frame } from './faceon';
import { handlesForAll } from './presets';
import { coverCrop } from '../capture/snapshot';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { UV } from '../render/faceMesh';
import type { Handle } from './presets';
import { unwarpPoint } from './warpMath';
import type { Face } from '../tracking/faceTracker';

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
  it('keeps its size when the head turns or nods: the larger of width and height counts', () => {
    const front = faceFrame(face(), A).width;
    const turned = face();
    for (let i = 0; i < 468; i++) turned[i * 3] = 0.5 + (turned[i * 3] - 0.5) * 0.6; // seen from the side, the face is narrow
    const nodded = face();
    for (let i = 0; i < 468; i++) nodded[i * 3 + 1] = 0.5 + (nodded[i * 3 + 1] - 0.5) * 0.6; // seen from above, it is short
    expect(faceFrame(turned, A).width).toBeGreaterThan(front * 0.72);
    expect(faceFrame(nodded, A).width).toBeCloseTo(front, 6);
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
  it('pins eyes and mouth to fixed places: the same for every face, place, size and roll', () => {
    const faces = [face(), face(0.3, 0.7, 0.18, -0.4), face(0.6, 0.4, 0.45, 0.3)];
    const squeezed = face(); // another child: eyes nearer to each other, mouth lower
    for (const i of [...EYE_R, ...EYE_L]) squeezed[i * 3] = 0.5 + (squeezed[i * 3] - 0.5) * 0.7;
    for (const i of LIPS) squeezed[i * 3 + 1] += 0.03;
    for (const lm of [...faces, squeezed]) {
      const w = windows(lm, [], A);
      w.forEach((win, n) => { expect(win[0]).toBeCloseTo(SLOTS[n][0], 3); expect(win[1]).toBeCloseTo(SLOTS[n][1], 6); }); // 3 digits: the test face is not exactly even
    }
  });
  it('shows the live eye in its window, wherever the eye is in the camera picture', () => {
    const lm = face(0.3, 0.7, 0.18, -0.4);
    const f = faceFrame(lm, A);
    windows(lm, [], A).forEach(([cx, cy, , , ox, oy], n) => {
      const ring = [EYE_R, EYE_L, LIPS][n];
      const q = ring.map((i) => toFace([lm[i * 3], lm[i * 3 + 1]], f, A));
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      expect(cx + ox).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 9);
      expect(cy + oy).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 9);
    });
  });
  it('a turned head moves eyes and mouth a little to the side, all three together, never far', () => {
    const turned = (by: number) => { const lm = face(); lm[4 * 3] += by * 0.3 * 0.984; return windows(lm, [], A); }; // the nose tip moves, as in a head that turns
    const a = turned(0.1);
    const swing = a[0][0] - SLOTS[0][0];
    expect(swing).toBeGreaterThan(0.01);
    expect(swing).toBeLessThan(SWING);
    a.forEach((w, n) => { expect(w[0] - SLOTS[n][0]).toBeCloseTo(swing, 9); expect(w[1]).toBeCloseTo(SLOTS[n][1], 9); });
    expect(turned(0.6)[2][0] - SLOTS[2][0]).toBeCloseTo(SWING, 9);
    expect(turned(-0.6)[2][0] - SLOTS[2][0]).toBeCloseTo(-SWING, 9);
    expect(turned(0)[0][0]).toBeCloseTo(SLOTS[0][0], 3);
  });
  it('takes the places of a target that has its own', () => {
    const w = windows(face(), [], A, { eyes: [0.3, 0.26], mouth: 0.33 });
    expect(w[0][0]).toBeCloseTo(-0.3, 3); expect(w[1][0]).toBeCloseTo(0.3, 3);
    expect(w[0][1]).toBeCloseTo(-0.26, 6); expect(w[2][1]).toBeCloseTo(0.33, 6);
  });
  it('a filter on the whole head makes eyes and mouth bigger, at their place on the picture', () => {
    const lm = face();
    const f = faceFrame(lm, A);
    const head: Handle = { cx: f.nose[0], cy: f.nose[1], r: 0.3, strength: 0.4, type: 0 };
    const plain = windows(lm, [], A), bigHead = windows(lm, [head], A);
    for (let i = 0; i < 3; i++) {
      expect(bigHead[i][0]).toBeCloseTo(plain[i][0], 9); // same place: the orange does not grow with the head
      expect(bigHead[i][1]).toBeCloseTo(plain[i][1], 9);
      expect(bigHead[i][2]).toBeGreaterThan(plain[i][2]); // bigger
    }
    expect(bigHead[0][4]).toBeLessThan(plain[0][4]);    // the filter shows the right eye farther out: the window reads there
    expect(bigHead[1][4]).toBeGreaterThan(plain[1][4]);
    expect(bigHead[2][5]).toBeGreaterThan(plain[2][5]); // and the mouth farther down
  });
  it('the window reads where the filters show the eye', () => {
    const lm = face();
    const f = faceFrame(lm, A);
    const head: Handle = { cx: f.nose[0] + 0.02, cy: f.nose[1], r: 0.3, strength: 0.4, type: 0 };
    const [cx, cy, , , ox, oy] = windows(lm, [head], A)[0];
    // centre of the ring box after the forward map, by hand
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const i of EYE_R) {
      const [x, y] = toFace(unwarpPoint([lm[i * 3], lm[i * 3 + 1]], [head], A), f, A);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    expect(cx + ox).toBeCloseTo((x0 + x1) / 2, 9);
    expect(cy + oy).toBeCloseTo((y0 + y1) / 2, 9);
  });
  it('limits the size of a window: eyes and mouth stay on the target', () => {
    const lm = face();
    const f = faceFrame(lm, A);
    const huge: Handle = { cx: f.nose[0], cy: f.nose[1], r: 0.6, strength: 0.9, type: 0 };
    for (const [, , rx, ry] of windows(lm, [huge], A)) { expect(rx).toBeLessThanOrEqual(0.5); expect(ry).toBeLessThanOrEqual(0.4); }
  });
  it('stay inside the quad with a wide open mouth, a big head and a loud shout', () => {
    const lm = face();
    for (const i of [17, 84, 181, 314, 405, 14, 87, 317, 91, 146, 321, 375]) lm[i * 3 + 1] += 0.3 * 0.25 * A; // lower lip down by a quarter of the face width
    const f: Face = { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
    const w = windows(lm, handlesForAll(['bigHead', 'shout', 'bigMouth'], [f], A, 1), A);
    for (const [cx, cy, rx, ry] of w) {
      expect(Math.abs(cx) + rx).toBeLessThan(SPAN / 2);
      expect(Math.abs(cy) + ry).toBeLessThan(SPAN / 2);
    }
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

describe('cover offset', () => {
  // the face place on the screen, in clip space, after the slide
  const onScreen = (cw: number, ch: number, ew: number, eh: number, pw: number, ph: number, nose: [number, number]) => {
    const [sx, sy] = coverScale(cw, ch, ew, eh, pw, ph), [gx, gy] = coverOffset(cw, ch, ew, eh, pw, ph, nose);
    const v = coverCrop(cw, ch, ew, eh);
    const x = gx + (nose[0] - 0.5) * sx, y = gy - (nose[1] - 0.5) * (ph / pw) * sy;
    return { x, y, gx, gy, halfW: v.w / cw, halfH: v.h / ch, picW: sx / 2, picH: ((ph / pw) * sy) / 2 };
  };
  it('slides a wide photo so that a face at the side is on the screen', () => {
    // tall canvas, tall screen, landscape photo, face in the left quarter: not visible without the slide
    const s = onScreen(720, 1280, 412, 915, 1536, 1152, [0.25, 0.5]);
    expect(Math.abs(s.x)).toBeLessThan(s.halfW * 0.5);
  });
  it('never uncovers the screen', () => {
    for (const nose of [[0.02, 0.02], [0.98, 0.5], [0.5, 0.99], [0.25, 0.8]] as [number, number][]) {
      for (const [cw, ch, ew, eh, pw, ph] of [[720, 1280, 412, 915, 1536, 1152], [640, 480, 380, 860, 1152, 1536], [1280, 720, 1280, 720, 1000, 1000], [640, 480, 800, 600, 600, 1200]]) {
        const s = onScreen(cw, ch, ew, eh, pw, ph, nose);
        expect(s.picW - Math.abs(s.gx)).toBeGreaterThanOrEqual(s.halfW - 1e-9);
        expect(s.picH - Math.abs(s.gy)).toBeGreaterThanOrEqual(s.halfH - 1e-9);
      }
    }
  });
  it('leaves a face in the middle where it is', () => {
    const s = onScreen(640, 480, 380, 860, 1280, 1280, [0.5, 0.5]);
    expect(s.gx).toBeCloseTo(0, 9); expect(s.gy).toBeCloseTo(0, 9);
  });
});

describe('targets', () => {
  it('have a picture and a chip on disk, and a face place inside the picture', () => {
    expect(TARGETS.map((t) => t.id)).toEqual(['orange', 'apple', 'cat', 'dog', 'lion', 'teddy-bear', 'potato', 'egg', 'pumpkin', 'toast', 'robot', 'moon', 'cloud']);
    expect(new Set(TARGETS.map((t) => t.icon)).size).toBe(TARGETS.length);
    for (const t of TARGETS) {
      expect(existsSync('public' + t.img), t.img).toBe(true);
      expect(existsSync('public' + t.chip), t.chip).toBe(true);
      expect(t.nose[0], t.id).toBeGreaterThan(0.3); expect(t.nose[0], t.id).toBeLessThan(0.7);
      expect(t.nose[1], t.id).toBeGreaterThan(0.3); expect(t.nose[1], t.id).toBeLessThan(0.7);
      expect(t.width).toBeGreaterThan(0.2); expect(t.width).toBeLessThan(0.6);
    }
    expect(FACEON[0].id).toBe('none');
    expect(FACEON.at(-1)!.id).toBe('photo');
  });
  it('every picture in public/targets belongs to a target: no file ships for nothing', () => {
    const want = TARGETS.flatMap((t) => [t.img, t.chip!]).map((f) => f.replace('/targets/', '')).sort();
    expect(readdirSync('public/targets').sort()).toEqual(want);
  });
  it('a second tap turns the target off', () => {
    expect(pickTarget('none', 'cat')).toBe('cat');
    expect(pickTarget('cat', 'cat')).toBe('none');
    expect(pickTarget('cat', 'dog')).toBe('dog');
    expect(pickTarget('photo', 'cat')).toBe('cat');
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
