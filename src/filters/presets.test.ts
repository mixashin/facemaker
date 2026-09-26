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

  it('noNose pinches the nose tip with a small radius', () => {
    const h = handlesFor('noNose', [face()], 16 / 9);
    expect(h).toHaveLength(1);
    expect(h[0].cx).toBeCloseTo(0.5, 4); expect(h[0].cy).toBeCloseTo(0.5, 4);
    expect(h[0].strength).toBeLessThan(0);
    expect(h[0].r).toBeLessThan(0.4 * 0.25);
  });

  it('bigEars puts two positive handles outside the cheeks', () => {
    const h = handlesFor('bigEars', [face()], 16 / 9);
    expect(h).toHaveLength(2);
    expect(h[0].cx).toBeLessThan(0.3); expect(h[1].cx).toBeGreaterThan(0.7);
    expect(h[0].strength).toBeGreaterThan(0); expect(h[1].strength).toBeGreaterThan(0);
  });

  it('doubleChin bulges below the chin', () => {
    const h = handlesFor('doubleChin', [face()], 16 / 9);
    expect(h).toHaveLength(1);
    expect(h[0].cy).toBeGreaterThan(0.8);
    expect(h[0].strength).toBeGreaterThan(0);
  });

  it('fatFace gives three positive handles', () => {
    const h = handlesFor('fatFace', [face()], 16 / 9);
    expect(h).toHaveLength(3);
    for (const x of h) expect(x.strength).toBeGreaterThan(0);
  });

  it('upsideDown is one flip handle rotating by pi around the face centre', () => {
    const h = handlesFor('upsideDown', [face()], 16 / 9);
    expect(h).toHaveLength(1);
    expect(h[0].type).toBe(2);
    expect(h[0].strength).toBeCloseTo(Math.PI, 6);
    expect(h[0].cy).toBeCloseTo(0.5, 4);
    expect(h[0].r).toBeCloseTo(0.62 * Math.max(0.4, 0.6 / (16 / 9)), 4); // face height converted to x units
  });

  it('has twelve presets, each with an icon', () => {
    expect(PRESETS).toHaveLength(12);
    expect(new Set(PRESETS.map((p) => p.icon)).size).toBe(12);
  });
});

describe('shout', () => {
  it('is in the strip', () => {
    expect(PRESETS.map((p) => p.id)).toContain('shout');
  });

  it('does nothing in silence', () => {
    expect(handlesFor('shout', [face()], 16 / 9, 0)).toEqual([]);
    expect(handlesFor('shout', [face()], 16 / 9)).toEqual([]);
  });

  it('grows the mouth and the head with the voice level', () => {
    const loud = handlesFor('shout', [face()], 16 / 9, 1);
    expect(loud).toHaveLength(2);
    expect(loud[0].cx).toBeCloseTo(0.5, 4); expect(loud[0].cy).toBeCloseTo(0.63, 4); // mouth
    expect(loud[0].strength).toBeCloseTo(0.9, 6);
    expect(loud[1].strength).toBeCloseTo(0.45, 6);
    const half = handlesFor('shout', [face()], 16 / 9, 0.5);
    expect(half[0].strength).toBeCloseTo(0.45, 6);
    expect(half[1].strength).toBeCloseTo(0.225, 6);
  });

  it('clamps a level above one', () => {
    expect(handlesFor('shout', [face()], 16 / 9, 7)[0].strength).toBeCloseTo(0.9, 6);
  });

  it('the level does not change other presets', () => {
    expect(handlesFor('bigEyes', [face()], 16 / 9, 0)).toEqual(handlesFor('bigEyes', [face()], 16 / 9, 1));
  });
});
