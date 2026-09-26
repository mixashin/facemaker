import { describe, it, expect } from 'vitest';
import { OneEuro, OneEuroArray } from './oneEuro';

describe('OneEuro', () => {
  it('passes a constant through unchanged', () => {
    const f = new OneEuro();
    let y = 0;
    for (let i = 0; i < 20; i++) y = f.filter(0.5, i * 33);
    expect(y).toBeCloseTo(0.5, 6);
  });

  it('damps jitter on a still signal', () => {
    const f = new OneEuro();
    const noisy = [0.5, 0.52, 0.48, 0.51, 0.49, 0.5, 0.52, 0.48];
    const out = noisy.map((v, i) => f.filter(v, i * 33));
    const spread = Math.max(...out.slice(2)) - Math.min(...out.slice(2));
    expect(spread).toBeLessThan(0.02);
  });

  it('follows a fast ramp with little lag', () => {
    const f = new OneEuro();
    let y = 0;
    for (let i = 0; i < 30; i++) y = f.filter(i / 30, i * 33);
    expect(y).toBeGreaterThan(0.85);
  });

  it('array variant filters each index independently', () => {
    const f = new OneEuroArray(2);
    const dst = new Float32Array(2);
    f.filter(new Float32Array([0.2, 0.8]), dst, 0);
    f.filter(new Float32Array([0.2, 0.8]), dst, 33);
    expect(dst[0]).toBeCloseTo(0.2, 4);
    expect(dst[1]).toBeCloseTo(0.8, 4);
  });
});
