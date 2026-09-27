import { describe, it, expect } from 'vitest';
import { warpPoint, unwarpPoint } from './warpMath';
import type { Handle } from './presets';

const A = 4 / 3;
const big: Handle = { cx: 0.5, cy: 0.5, r: 0.3, strength: 0.6, type: 0 };
const small: Handle = { cx: 0.4, cy: 0.45, r: 0.2, strength: -0.9, type: 0 };
const swirl: Handle = { cx: 0.55, cy: 0.5, r: 0.25, strength: 1.2, type: 1 };
const flip: Handle = { cx: 0.5, cy: 0.5, r: 0.3, strength: Math.PI, type: 2 };
const near = (a: [number, number], b: [number, number]) => { expect(a[0]).toBeCloseTo(b[0], 4); expect(a[1]).toBeCloseTo(b[1], 4); };

describe('warpPoint', () => {
  it('leaves a point outside every handle where it is', () => {
    near(warpPoint([0.05, 0.05], [big, swirl], A), [0.05, 0.05]);
  });
  it('reads closer to the centre under a magnifier', () => {
    const [x] = warpPoint([0.6, 0.5], [big], A);
    expect(x).toBeGreaterThan(0.5); expect(x).toBeLessThan(0.6);
  });
  it('measures the radius in x units on both axes', () => {
    // 0.2 below the centre is 0.2 / A in x units: inside r 0.3. 0.35 to the right is outside.
    expect(warpPoint([0.5, 0.7], [big], A)[1]).not.toBeCloseTo(0.7, 4);
    near(warpPoint([0.85, 0.5], [big], A), [0.85, 0.5]);
  });
  it('gives the numbers of the shader for one known case', () => {
    // scale handle, strength 0.6, r 0.3, point 0.15 right of the centre: t = 0.5, f = (1 - 0.25)^2 = 0.5625
    near(warpPoint([0.65, 0.5], [big], A), [0.5 + 0.15 * (1 - 0.6 * 0.5625), 0.5]);
    // swirl, strength 1.2, r 0.25, point 0.125 right of the centre: t = 0.5, angle = 1.2 * 0.5625 = 0.675
    near(warpPoint([0.675, 0.5], [swirl], A), [0.55 + 0.125 * Math.cos(0.675), 0.5 + 0.125 * Math.sin(0.675) * A]);
  });
});

describe('unwarpPoint', () => {
  it('is the reverse of warpPoint for every handle type and for a chain', () => {
    const sets = [[big], [small], [swirl], [flip], [big, small, swirl], [flip, big]];
    for (const hs of sets) for (let i = 0; i < 40; i++) {
      const p: [number, number] = [0.2 + ((i * 37) % 60) / 100, 0.2 + ((i * 53) % 60) / 100];
      near(warpPoint(unwarpPoint(p, hs, A), hs, A), p);
    }
  });
  it('moves a point outward under a magnifier: the eye shows farther from the centre', () => {
    const [x] = unwarpPoint([0.56, 0.5], [big], A);
    expect(x).toBeGreaterThan(0.56);
  });
  it('does nothing without handles', () => {
    near(unwarpPoint([0.3, 0.7], [], A), [0.3, 0.7]);
  });
  it('keeps the centre of a handle where it is', () => {
    near(unwarpPoint([0.5, 0.5], [big], A), [0.5, 0.5]);
  });
});
