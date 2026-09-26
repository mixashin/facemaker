import { describe, it, expect } from 'vitest';
import { handlesFor, PRESETS } from './presets';
import type { Face } from '../tracking/faceTracker';

function face(): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5);           // cheeks: face width 0.4
  set(10, 0.5, 0.2); set(152, 0.5, 0.8);            // forehead top, chin
  set(13, 0.5, 0.62); set(14, 0.5, 0.64);           // inner lips
  for (let i = 468; i < 473; i++) set(i, 0.42, 0.45); // left iris
  for (let i = 473; i < 478; i++) set(i, 0.58, 0.45); // right iris
  set(4, 0.5, 0.5);                                 // nose tip
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}

describe('handlesFor', () => {
  it('returns nothing for none or no faces', () => {
    expect(handlesFor('none', [face()], 16 / 9)).toEqual([]);
    expect(handlesFor('bigEyes', [], 16 / 9)).toEqual([]);
  });

  it('bigEyes gives two positive scale handles centred on the irises', () => {
    const h = handlesFor('bigEyes', [face()], 16 / 9);
    expect(h).toHaveLength(2);
    expect(h[0].cx).toBeCloseTo(0.42, 4); expect(h[0].cy).toBeCloseTo(0.45, 4);
    expect(h[1].cx).toBeCloseTo(0.58, 4);
    expect(h[0].strength).toBeGreaterThan(0); expect(h[0].type).toBe(0);
    expect(h[0].r).toBeCloseTo(0.4 * 0.22, 4);
  });

  it('smallFace gives one negative handle on the face centre', () => {
    const h = handlesFor('smallFace', [face()], 16 / 9);
    expect(h).toHaveLength(1);
    expect(h[0].strength).toBeLessThan(0);
    expect(h[0].cx).toBeCloseTo(0.5, 4); expect(h[0].cy).toBeCloseTo(0.5, 4);
  });

  it('two faces double the handles', () => {
    expect(handlesFor('bigMouth', [face(), face()], 16 / 9)).toHaveLength(2);
  });

  it('every preset has an icon', () => {
    for (const p of PRESETS) expect(p.icon.length).toBeGreaterThan(0);
  });
});
