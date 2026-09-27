import { describe, it, expect } from 'vitest';
import { inputSize, MaskSmoother, MASK_EDGE } from './mask';

describe('inputSize', () => {
  it('keeps the aspect and puts the long side at the edge', () => {
    expect(inputSize(1280, 720)).toEqual([MASK_EDGE, 144]);
    expect(inputSize(720, 1280)).toEqual([144, MASK_EDGE]);
    expect(inputSize(640, 480)).toEqual([MASK_EDGE, 192]);
  });
  it('does not enlarge a small frame', () => {
    expect(inputSize(160, 120)).toEqual([160, 120]);
  });
});

describe('MaskSmoother', () => {
  const mask = (v: number, n = 12) => new Uint8Array(n).fill(v);
  it('takes the first mask as it is', () => {
    expect([...new MaskSmoother().push(mask(200), 4, 3)]).toEqual([...mask(200)]);
  });
  it('moves toward the new mask, part of the way', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0), 4, 3);
    expect(s.push(mask(255), 4, 3)[0]).toBe(153); // 0.4 * 0 + 0.6 * 255
    expect(s.push(mask(255), 4, 3)[0]).toBe(214);
  });
  it('an empty mask stays empty after smoothing', () => {
    const s = new MaskSmoother();
    s.push(mask(0), 4, 3);
    expect(Math.max(...s.push(mask(0), 4, 3))).toBe(0);
  });
  it('a full mask stays full after smoothing', () => {
    const s = new MaskSmoother();
    s.push(mask(255), 4, 3);
    expect(Math.min(...s.push(mask(255), 4, 3))).toBe(255);
  });
  it('starts again when the size changes', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0, 12), 4, 3);
    expect([...s.push(mask(255, 6), 3, 2)]).toEqual([...mask(255, 6)]);
  });
  it('starts again after reset', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0), 4, 3);
    s.reset();
    expect(s.push(mask(255), 4, 3)[0]).toBe(255);
  });
  it('does not keep the buffer of the caller', () => {
    const s = new MaskSmoother(0.4);
    const first = mask(100);
    const out = s.push(first, 4, 3);
    first.fill(0);
    expect(out[0]).toBe(100);
  });
});
