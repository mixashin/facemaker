import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { SCENES, BACKDROPS, pickScene, sceneById, sceneFit, type Scene } from './scenes';
import { coverScale } from './faceon';

describe('scenes', () => {
  it('start with none and have their files on disk', () => {
    expect(BACKDROPS[0].id).toBe('none');
    expect(BACKDROPS.slice(1).map((b) => b.id)).toEqual(SCENES.map((s) => s.id));
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const s of SCENES) for (const f of [s.plate, s.chip, s.video, s.far, s.near]) if (f) expect(existsSync('public' + f), f).toBe(true);
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
