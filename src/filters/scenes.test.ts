import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { SCENES, BACKDROPS, pickScene, sceneById, sceneFit, bitSprites, type Scene, type View } from './scenes';
import { coverScale } from './faceon';

const ALL: View = { x0: 0, x1: 1, y0: 0, y1: 1 };
const scene = (motion: 'rise' | 'fall' | 'drift' | 'twinkle', count = 6, size = 0.1): Scene => ({ id: 's', icon: 'x', plate: '/p.webp', bits: [{ src: '/b.webp', motion, count, size }] });

describe('scenes', () => {
  it('start with none and have their files on disk', () => {
    expect(BACKDROPS[0].id).toBe('none');
    expect(BACKDROPS.slice(1).map((b) => b.id)).toEqual(SCENES.map((s) => s.id));
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const s of SCENES) {
      for (const f of [s.plate, s.chip, s.video, s.far, s.near, ...(s.bits ?? []).map((b) => b.src)]) if (f) expect(existsSync('public' + f), f).toBe(true);
      expect(s.icon.length, s.id).toBeGreaterThan(0);
      for (const b of s.bits ?? []) { expect(b.count).toBeGreaterThan(0); expect(b.count).toBeLessThanOrEqual(12); expect(b.size).toBeGreaterThan(0.02); expect(b.size).toBeLessThan(0.3); }
    }
  });
  it('shows the four scenes of the plan first', () => {
    expect(SCENES.slice(0, 4).map((s) => s.id)).toEqual(['underwater', 'grassland', 'spooky', 'space']);
  });
  it('a second tap turns the scene off', () => {
    expect(pickScene('none', 'space')).toBe('space');
    expect(pickScene('space', 'space')).toBe('none');
    expect(pickScene('space', 'spooky')).toBe('spooky');
  });
  it('finds a scene by id, also one that is not in the list', () => {
    const extra: Scene = { id: 'try', icon: 'x', plate: '/targets/orange.webp' };
    expect(sceneById('none')).toBeNull();
    expect(sceneById('try')).toBeNull();
    expect(sceneById('try', extra)).toBe(extra);
    expect(sceneById('other', extra)).toBeNull();
    expect(sceneById('space')?.id).toBe('space');
  });
});

describe('sceneFit', () => {
  it('shows the whole height of a square scene on a canvas of the same height', () => {
    // canvas 640 x 480, all of it on screen, square scene: the scene is 640 wide, so 480 of its 640 rows show
    const fit = sceneFit(coverScale(640, 480, 640, 480, 1000, 1000), 1000, 1000, false);
    expect(fit[0]).toBeCloseTo(1, 5);      // the full width of the scene
    expect(fit[1]).toBeCloseTo(0.75, 5);   // three quarters of its height
  });
  it('shows the middle column of the scene on a tall screen', () => {
    // canvas 640 x 480 on a screen 380 x 860: the screen shows a column 212 px wide. The scene covers 480 x 480.
    const fit = sceneFit(coverScale(640, 480, 380, 860, 1000, 1000), 1000, 1000, false);
    expect(fit[0]).toBeCloseTo(640 / 480, 5); // the canvas is wider than the scene: uv runs past 0..1 off screen
    expect(fit[1]).toBeCloseTo(1, 5);
  });
  it('flips the scene for the front camera', () => {
    const a = sceneFit([2, 2], 1000, 1000, false), b = sceneFit([2, 2], 1000, 1000, true);
    expect(b[0]).toBeCloseTo(-a[0], 5);
    expect(b[1]).toBeCloseTo(a[1], 5);
  });
  it('keeps the shape of a scene that is not square', () => {
    const fit = sceneFit(coverScale(640, 480, 640, 480, 2000, 1000), 2000, 1000, false);
    // a wide scene covers the height: 480 rows are all of its height, 640 columns are two thirds of its 960
    expect(fit[1]).toBeCloseTo(1, 5);
    expect(fit[0]).toBeCloseTo(640 / 960, 5);
  });
});

describe('floating bits', () => {
  it('gives the count of the scene, and nothing for a scene without bits', () => {
    expect(bitSprites(scene('rise', 7), 0, 1, ALL)).toHaveLength(7);
    expect(bitSprites({ id: 's', icon: 'x', plate: '/p.webp' }, 0, 1, ALL)).toEqual([]);
    expect(bitSprites(null, 0, 1, ALL)).toEqual([]);
  });
  it('is the same picture for the same time', () => {
    expect(bitSprites(scene('drift'), 4321, 1.5, ALL)).toEqual(bitSprites(scene('drift'), 4321, 1.5, ALL));
  });
  it('spreads the bits: no two at the same place', () => {
    const s = bitSprites(scene('rise', 8), 1000, 1, ALL);
    const keys = new Set(s.map((b) => `${b.cx.toFixed(2)},${b.cy.toFixed(2)}`));
    expect(keys.size).toBe(8);
  });
  it('bubbles rise and come back at the bottom', () => {
    const at = (t: number) => bitSprites(scene('rise', 1), t, 1, ALL)[0].cy;
    let up = 0, jumps = 0;
    for (let t = 0; t < 60000; t += 250) { const d = at(t + 250) - at(t); if (d < 0) up++; else if (d > 0.5) jumps++; }
    expect(up).toBeGreaterThan(200); // nearly every step goes up
    expect(jumps).toBeGreaterThanOrEqual(2); // and it starts again from the bottom
  });
  it('snow falls', () => {
    const at = (t: number) => bitSprites(scene('fall', 1), t, 1, ALL)[0].cy;
    let down = 0;
    for (let t = 0; t < 30000; t += 250) if (at(t + 250) > at(t)) down++;
    expect(down).toBeGreaterThan(100);
  });
  it('a drifting bit crosses the picture from side to side', () => {
    const xs = Array.from({ length: 400 }, (_, i) => bitSprites(scene('drift', 1), i * 250, 1, ALL)[0].cx);
    expect(Math.min(...xs)).toBeLessThan(0.05);
    expect(Math.max(...xs)).toBeGreaterThan(0.95);
  });
  it('stars stay where they are, change their size, and keep off the face in the middle', () => {
    const a = bitSprites(scene('twinkle', 8), 0, 1, ALL), b = bitSprites(scene('twinkle', 8), 700, 1, ALL);
    a.forEach((s, i) => {
      expect(b[i].cx).toBeCloseTo(s.cx, 9); expect(b[i].cy).toBeCloseTo(s.cy, 9);
      expect(Math.abs(s.cx - 0.5) > 0.2 || Math.abs(s.cy - 0.5) > 0.28).toBe(true);
    });
    expect(a.some((s, i) => Math.abs(s.size - b[i].size) > 0.001)).toBe(true);
  });
  it('stays in the part of the picture that the screen shows, with sizes that fit it', () => {
    const view: View = { x0: 0.33, x1: 0.67, y0: 0, y1: 1 }; // a wide camera picture on a tall screen
    for (const m of ['rise', 'fall', 'drift', 'twinkle'] as const) for (let t = 0; t < 40000; t += 1700) {
      for (const b of bitSprites(scene(m, 6, 0.1), t, 4 / 3, view)) {
        expect(b.cx).toBeGreaterThan(0.33 - 0.05); expect(b.cx).toBeLessThan(0.67 + 0.05);
        expect(b.size).toBeLessThan(0.05); // a tenth of the visible width, not of the whole picture
      }
    }
  });
});
