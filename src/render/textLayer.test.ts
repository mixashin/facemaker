import { describe, it, expect } from 'vitest';
import { textVisible, fitFontPx, elementToCanvas } from './textLayer';

describe('text layer math', () => {
  it('hides null and whitespace-only text', () => {
    expect(textVisible(null)).toBe(false);
    expect(textVisible({ text: '   ', color: '#fff', font: 'a', x: 0.5, y: 0.5, scale: 1 })).toBe(false);
    expect(textVisible({ text: 'Čćžšđ 🐱', color: '#fff', font: 'a', x: 0.5, y: 0.5, scale: 1 })).toBe(true);
  });

  it('shrinks the font only when the text is wider than the canvas', () => {
    expect(fitFontPx(500, 1000)).toBe(96);
    expect(fitFontPx(2000, 1000)).toBe(48);
  });

  it('maps element coords to canvas coords under object-fit cover', () => {
    // canvas 16:9 shown in a 4:3 element: the element crops the canvas sides
    const [x, y] = elementToCanvas(0, 0.5, 16 / 9, 4 / 3);
    expect(x).toBeCloseTo(0.5 - 0.5 * (4 / 3) / (16 / 9), 6); expect(y).toBeCloseTo(0.5, 6);
    // canvas 4:3 shown in a 16:9 element: the element crops top and bottom
    const [x2, y2] = elementToCanvas(0.5, 0, 4 / 3, 16 / 9);
    expect(x2).toBeCloseTo(0.5, 6); expect(y2).toBeCloseTo(0.5 - 0.5 * (4 / 3) / (16 / 9), 6);
    // same aspect: identity
    expect(elementToCanvas(0.2, 0.8, 1.5, 1.5)).toEqual([0.2, 0.8]);
  });
});

describe('fonts', () => {
  it('font b ends in a generic family that differs from font a on every platform', async () => {
    const { FONTS } = await import('./textLayer');
    const generic = (stack: string) => stack.split(',').at(-1)!.trim();
    expect(generic(FONTS.a)).toBe('sans-serif');
    expect(generic(FONTS.b)).toBe('serif');
  });
});
