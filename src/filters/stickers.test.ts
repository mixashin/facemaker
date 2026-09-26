import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { STICKER_PACKS, emojiFile, spritesFor } from './stickers';
import type { Face } from '../tracking/faceTracker';

const ASPECT = 16 / 9;

function face(rightEyeDy = 0): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5);                 // cheeks: face width 0.4
  set(10, 0.5, 0.2); set(152, 0.5, 0.8);                  // top, chin: face height 0.6
  set(13, 0.5, 0.62); set(14, 0.5, 0.64);                 // inner lips
  for (let i = 468; i < 473; i++) set(i, 0.42, 0.45);     // left iris
  for (let i = 473; i < 478; i++) set(i, 0.58, 0.45 + rightEyeDy); // right iris
  set(4, 0.5, 0.5);                                       // nose tip
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}

describe('emojiFile', () => {
  it('maps an emoji to its Twemoji file, dropping the variation selector', () => {
    expect(emojiFile('🐱')).toBe('/stickers/1f431.svg');
    expect(emojiFile('❤️')).toBe('/stickers/2764.svg');
    expect(emojiFile('🕶️')).toBe('/stickers/1f576.svg');
  });
});

describe('STICKER_PACKS', () => {
  it('starts with none and has an icon per pack', () => {
    expect(STICKER_PACKS[0].id).toBe('none');
    expect(STICKER_PACKS[0].items).toEqual([]);
    for (const p of STICKER_PACKS) expect(p.icon.length).toBeGreaterThan(0);
  });

  it('every emoji used has a copied svg (run scripts/copy-twemoji.mjs)', () => {
    for (const p of STICKER_PACKS) for (const it of p.items) {
      expect(existsSync('public' + emojiFile(it.emoji)), `${p.id}: ${it.emoji}`).toBe(true);
    }
  });
});

describe('spritesFor', () => {
  it('returns nothing for none or for no faces', () => {
    expect(spritesFor('none', [face()], ASPECT)).toEqual([]);
    expect(spritesFor('cat', [], ASPECT)).toEqual([]);
    expect(spritesFor('unknown', [face()], ASPECT)).toEqual([]);
  });

  it('cat mask sits on the face centre, sized 1.25 of the larger face dimension in x units', () => {
    const s = spritesFor('cat', [face()], ASPECT);
    expect(s).toHaveLength(1);
    expect(s[0].emoji).toBe('🐱');
    expect(s[0].cx).toBeCloseTo(0.5, 4); expect(s[0].cy).toBeCloseTo(0.5, 4);
    const heightX = 0.6 / ASPECT; // 0.3375
    expect(s[0].size).toBeCloseTo(1.25 * Math.max(0.4, heightX), 4);
    expect(s[0].angle).toBeCloseTo(0, 6);
  });

  it('hearts land on both irises', () => {
    const s = spritesFor('hearts', [face()], ASPECT);
    expect(s).toHaveLength(2);
    expect(s[0].cx).toBeCloseTo(0.42, 4); expect(s[1].cx).toBeCloseTo(0.58, 4);
    expect(s[0].cy).toBeCloseTo(0.45, 4);
  });

  it('crown sits above the forehead', () => {
    const s = spritesFor('crown', [face()], ASPECT);
    expect(s[0].cy).toBeLessThan(0.2);
    expect(s[0].cx).toBeCloseTo(0.5, 4);
  });

  it('angle follows the eye line, corrected for aspect', () => {
    const s = spritesFor('sunglasses', [face(0.1)], ASPECT);
    expect(s[0].angle).toBeCloseTo(Math.atan2(0.1 / ASPECT, 0.16), 4);
  });

  it('two faces get stickers each', () => {
    expect(spritesFor('stars', [face(), face()], ASPECT)).toHaveLength(4);
  });
});
