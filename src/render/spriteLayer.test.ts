import { describe, it, expect } from 'vitest';
import { spriteTransform } from './spriteLayer';

const s = (cx: number, cy: number, size = 0.1, angle = 0) => ({ emoji: '🐱', cx, cy, size, angle });

describe('spriteTransform', () => {
  it('maps the image centre to NDC origin', () => {
    const t = spriteTransform(s(0.5, 0.5), false, 16 / 9);
    expect(t.x).toBeCloseTo(0, 6); expect(t.y).toBeCloseTo(0, 6);
  });

  it('maps image coords (y down) to NDC (y up) and mirrors x on request', () => {
    const t = spriteTransform(s(0.25, 0.25), false, 16 / 9);
    expect(t.x).toBeCloseTo(-0.5, 6); expect(t.y).toBeCloseTo(0.5, 6);
    const m = spriteTransform(s(0.25, 0.25), true, 16 / 9);
    expect(m.x).toBeCloseTo(0.5, 6); expect(m.y).toBeCloseTo(0.5, 6);
  });

  it('keeps the sprite square in pixels: NDC height is width times aspect', () => {
    const t = spriteTransform(s(0.5, 0.5, 0.1), false, 2);
    expect(t.sx).toBeCloseTo(0.2, 6); expect(t.sy).toBeCloseTo(0.4, 6);
  });

  it('rotation follows the image-space angle and flips with the mirror', () => {
    expect(spriteTransform(s(0.5, 0.5, 0.1, 0.3), false, 1).rot).toBeCloseTo(-0.3, 6);
    expect(spriteTransform(s(0.5, 0.5, 0.1, 0.3), true, 1).rot).toBeCloseTo(0.3, 6);
  });
});
