import { describe, it, expect } from 'vitest';
import { usable } from './faces';

const spread = (n: number, size: number, cx = 0.5, cy = 0.5) => Float32Array.from(Array.from({ length: n }, (_, i) => [cx + size * Math.cos(i), cy + size * Math.sin(i), 0]).flat());

describe('usable', () => {
  it('takes a face with a size', () => {
    expect(usable(spread(478, 0.2))).toBe(true);
    expect(usable(spread(478, 0.02))).toBe(true); // a small face far away
  });
  it('refuses a face with no size: all points at one place (seen on a phone, it broke the tracker)', () => {
    expect(usable(spread(478, 0))).toBe(false);
    expect(usable(new Float32Array(478 * 3))).toBe(false);
    expect(usable(spread(478, 0.0005))).toBe(false);
  });
  it('refuses numbers that are no numbers', () => {
    const bad = spread(478, 0.2); bad[300] = NaN;
    expect(usable(bad)).toBe(false);
    const far = spread(478, 0.2); far[9] = Infinity;
    expect(usable(far)).toBe(false);
  });
  it('refuses a face with too few points, and no face', () => {
    expect(usable(spread(10, 0.2))).toBe(false);
    expect(usable(spread(468, 0.2))).toBe(false); // the app reads 478 points (with the irises)
    expect(usable(spread(477, 0.2))).toBe(false);
    expect(usable(new Float32Array(0))).toBe(false);
    expect(usable(null)).toBe(false);
  });
});

describe('usable: upper limit', () => {
  it('refuses a face that is larger than any picture', () => {
    const wild = spread(478, 0); wild[0] = 1e20;
    expect(usable(wild)).toBe(false);
    expect(usable(spread(478, 5))).toBe(false);
  });
  it('takes a face that is close and partly outside the picture', () => {
    expect(usable(spread(478, 0.8, 0.1, 0.9))).toBe(true);
  });
});
