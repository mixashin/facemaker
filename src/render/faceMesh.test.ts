import { describe, it, expect } from 'vitest';
import { UV, TRI, VERTS, meshPositions, trianglesOutside } from './faceMesh';
import { MOUTH, EYE_R, EYE_L } from '../filters/makeup';
// @ts-expect-error plain node script, no types
import { parseObj } from '../../scripts/fetch-facemesh.mjs';

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

describe('face mesh data', () => {
  it('has one uv per vertex and 898 triangles', () => {
    expect(VERTS).toBe(468);
    expect(UV.length).toBe(468 * 2);
    expect(TRI.length).toBe(898 * 3);
    for (const v of UV) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    const used = new Set(TRI);
    expect(used.size).toBe(468);
    expect(Math.max(...TRI)).toBe(467);
  });

  it('has no hole: the only open edge is the face oval', () => {
    const edges = new Map<string, number>();
    for (let t = 0; t < TRI.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = TRI[t + k], b = TRI[t + ((k + 1) % 3)];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const open = [...edges].filter(([, n]) => n === 1).flatMap(([k]) => k.split('-').map(Number));
    expect(new Set(open)).toEqual(new Set(OVAL));
    expect([...edges.values()].every((n) => n <= 2)).toBe(true);
  });

  it('winds every triangle counter-clockwise in the layout, so the front face is the visible one', () => {
    for (let t = 0; t < TRI.length; t += 3) {
      const [a, b, c] = [TRI[t], TRI[t + 1], TRI[t + 2]].map((i) => [UV[i * 2], UV[i * 2 + 1]]);
      expect((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])).toBeGreaterThan(0);
    }
  });

  it('is upright and symmetric: forehead on top, the right eye of the subject on the left', () => {
    expect(UV[10 * 2 + 1]).toBeGreaterThan(UV[152 * 2 + 1]); // v grows upward: forehead above chin
    expect(UV[33 * 2]).toBeLessThan(0.5);
    expect(UV[33 * 2] + UV[263 * 2]).toBeCloseTo(1, 3);
  });
});

describe('meshPositions', () => {
  it('maps the picture (0..1, y down) to clip space (-1..1, y up) and ignores the iris points', () => {
    const lm = new Float32Array(478 * 3);
    lm.set([0, 0, 0.5], 0); lm.set([1, 1, -0.5], 3); lm.set([0.5, 0.25, 0], 467 * 3);
    const out = meshPositions(lm, new Float32Array(468 * 3));
    expect([...out.slice(0, 3)]).toEqual([-1, 1, 0]);
    expect([...out.slice(3, 6)]).toEqual([1, -1, 0]);
    expect([...out.slice(467 * 3)]).toEqual([0, 0.5, 0]);
  });
});

describe('parseObj', () => {
  const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0.5 0.5', 'vt 0.1 0.2', 'vt 0.9 0.2', 'f 1/2 2/3 3/1'].join('\n');
  it('gives each vertex the uv that its faces name', () => {
    expect(parseObj(obj)).toEqual({ verts: 3, uv: [0.1, 0.2, 0.9, 0.2, 0.5, 0.5], tri: [0, 1, 2] });
  });
  it('refuses a vertex with two uvs, a quad, and a vertex without a face', () => {
    expect(() => parseObj(obj + '\nf 1/1 2/3 3/1')).toThrow(/two UVs/);
    expect(() => parseObj(obj + '\nf 1/2 2/3 3/1 1/2')).toThrow(/not a triangle/);
    expect(() => parseObj('v 0 0 0\n' + obj)).toThrow();
  });
});

describe('trianglesOutside', () => {
  // even-odd test of a point against a ring, in the flat layout
  const inside = (x: number, y: number, ring: number[]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = UV[ring[i] * 2], yi = UV[ring[i] * 2 + 1], xj = UV[ring[j] * 2], yj = UV[ring[j] * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const centres = (tri: Uint16Array) => Array.from({ length: tri.length / 3 }, (_, t) => {
    const [a, b, c] = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
    return [(UV[a * 2] + UV[b * 2] + UV[c * 2]) / 3, (UV[a * 2 + 1] + UV[b * 2 + 1] + UV[c * 2 + 1]) / 3];
  });

  it('cuts the mouth and the eyes out of the mesh: no triangle is left in an opening', () => {
    const open = trianglesOutside([MOUTH, EYE_R, EYE_L]);
    expect(open.length).toBe((898 - 18 - 14 - 14) * 3);
    for (const [x, y] of centres(open)) for (const ring of [MOUTH, EYE_R, EYE_L]) expect(inside(x, y, ring)).toBe(false);
  });
  it('takes away only what lies in an opening', () => {
    const gone = (898 * 3 - trianglesOutside([EYE_R]).length) / 3;
    expect(gone).toBe(14);
    const all = centres(TRI).filter(([x, y]) => inside(x, y, EYE_R)).length;
    expect(all).toBe(14);
  });
  it('keeps the whole mesh without rings', () => {
    expect([...trianglesOutside([])]).toEqual([...TRI]);
  });
});
