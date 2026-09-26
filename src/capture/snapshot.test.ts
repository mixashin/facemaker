import { describe, it, expect } from 'vitest';
import { coverCrop } from './snapshot';

describe('coverCrop', () => {
  it('crops the sides of a landscape canvas shown in a portrait element', () => {
    // 1280x720 canvas in a 380x860 element (object-fit: cover): full height, width = 720 * 380 / 860
    const c = coverCrop(1280, 720, 380, 860);
    expect(c.h).toBe(720);
    expect(c.w).toBeCloseTo(720 * 380 / 860, 6);
    expect(c.x).toBeCloseTo((1280 - c.w) / 2, 6);
    expect(c.y).toBe(0);
  });
  it('crops top and bottom of a portrait canvas shown in a landscape element', () => {
    const c = coverCrop(720, 1280, 800, 600);
    expect(c.w).toBe(720);
    expect(c.h).toBeCloseTo(720 * 600 / 800, 6);
    expect(c.y).toBeCloseTo((1280 - c.h) / 2, 6);
    expect(c.x).toBe(0);
  });
  it('keeps the whole canvas when the aspects match or the element is unknown', () => {
    expect(coverCrop(1280, 720, 1600, 900)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(coverCrop(1280, 720, 0, 0)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});
