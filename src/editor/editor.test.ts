import { describe, it, expect } from 'vitest';
import { EDITOR_STICKERS, elementToImage, hitTest, moveTo, pinch, flipSticker, renderEditor, type EditorSticker, inside, tilt, centre, MAX_TILT, FRAME } from './editor';
import { existsSync } from 'node:fs';

const st = (id: number, x: number, y: number, scale = 100, rot = 0): EditorSticker => ({ id, src: '/editor/pimple.svg', x, y, scale, rot });

describe('editor assets', () => {
  it('every palette entry has a file under public', () => {
    expect(EDITOR_STICKERS.length).toBeGreaterThanOrEqual(40);
    for (const s of EDITOR_STICKERS) expect(existsSync('public' + s.src), s.id).toBe(true);
    expect(new Set(EDITOR_STICKERS.map((s) => s.id)).size).toBe(EDITOR_STICKERS.length);
    const solid = EDITOR_STICKERS.filter((s) => s.model);
    expect(solid).toHaveLength(11); // the 3D props come first, then the flat props by Astra, then the emoji art
    expect(EDITOR_STICKERS.slice(0, 11)).toEqual(solid);
    for (const s of solid) { expect(s.id).toBe('3d-' + s.model); expect(existsSync(`public/props3d/${s.model}.glb`), s.id).toBe(true); }
    expect(EDITOR_STICKERS.slice(11, 14).every((s) => s.src.startsWith('/props/'))).toBe(true);
  });
});

describe('elementToImage', () => {
  it('maps element coords into image px under object-fit contain', () => {
    // 1000x500 image shown in a 500x500 element: image occupies y 125..375
    expect(elementToImage(250, 250, 1000, 500, 500, 500)).toEqual({ x: 500, y: 250 });
    expect(elementToImage(0, 125, 1000, 500, 500, 500)).toEqual({ x: 0, y: 0 });
    // 500x1000 image in a 500x500 element: image occupies x 125..375
    expect(elementToImage(125, 0, 500, 1000, 500, 500)).toEqual({ x: 0, y: 0 });
  });
});

describe('hitTest and moveTo', () => {
  it('returns the topmost sticker under the point', () => {
    const a = st(1, 100, 100), b = st(2, 120, 100);
    expect(hitTest([a, b], { x: 110, y: 100 })?.id).toBe(2);
    expect(hitTest([a, b], { x: 60, y: 100 })?.id).toBe(1);
    expect(hitTest([a, b], { x: 400, y: 400 })).toBeNull();
  });
  it('moveTo recentres', () => {
    expect(moveTo(st(1, 0, 0), { x: 5, y: 7 })).toMatchObject({ x: 5, y: 7 });
  });
});

describe('pinch', () => {
  it('scales by the finger distance ratio, rotates by the angle delta, follows the midpoint', () => {
    const s = st(1, 100, 100, 50, 0);
    const out = pinch(s, { x: 90, y: 100 }, { x: 110, y: 100 }, { x: 80, y: 120 }, { x: 120, y: 120 });
    expect(out.scale).toBeCloseTo(100, 6);
    expect(out.rot).toBeCloseTo(0, 6);
    expect(out.x).toBeCloseTo(100, 6); expect(out.y).toBeCloseTo(120, 6);
    const rot = pinch(s, { x: 90, y: 100 }, { x: 110, y: 100 }, { x: 100, y: 90 }, { x: 100, y: 110 });
    expect(rot.rot).toBeCloseTo(Math.PI / 2, 6);
    expect(pinch(s, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }).scale).toBeGreaterThanOrEqual(16);
  });
});

describe('renderEditor', () => {
  it('sizes the canvas to the image and draws each sticker centred, rotated and scaled', () => {
    const calls: string[] = [];
    const ctx = {
      canvas: { width: 0, height: 0 },
      clearRect: () => calls.push('clear'),
      drawImage: (...a: unknown[]) => calls.push('draw:' + a.slice(1).join(',')),
      save: () => calls.push('save'), restore: () => calls.push('restore'),
      translate: (x: number, y: number) => calls.push(`t:${x},${y}`), rotate: (r: number) => calls.push(`r:${r.toFixed(3)}`),
    };
    const img = { width: 1280, height: 720 };
    const sticker = { width: 200, height: 100 } as unknown as CanvasImageSource;
    renderEditor(ctx as never, img, [st(1, 640, 360, 200, 0.5)], new Map([['/editor/pimple.svg', sticker]]));
    expect(ctx.canvas.width).toBe(1280); expect(ctx.canvas.height).toBe(720);
    expect(calls[0]).toBe('draw:0,0,1280,720');
    expect(calls).toContain('t:640,360'); expect(calls).toContain('r:0.500');
    expect(calls).toContain('draw:-100,-50,200,100'); // width 200 keeps the 2:1 asset ratio
  });
});

describe('renderEditor selection glow', () => {
  const mk = () => {
    const calls: string[] = [];
    const ctx = {
      canvas: { width: 0, height: 0 }, clearRect() {}, drawImage() { calls.push('draw'); }, save() {}, restore() {},
      translate() {}, rotate() {}, strokeRect() { calls.push('glow'); }, shadowBlur: 0, shadowColor: '', strokeStyle: '', lineWidth: 0,
    };
    return { ctx, calls };
  };
  const images = new Map<string, CanvasImageSource>([['/editor/pimple.svg', { width: 100, height: 100 } as unknown as CanvasImageSource]]);

  it('strokes one glow box around the selected sticker only', () => {
    const a = mk();
    renderEditor(a.ctx as never, { width: 500, height: 500 }, [st(1, 100, 100), st(2, 200, 200)], images, 2);
    expect(a.calls.filter((c) => c === 'glow')).toHaveLength(1);
  });

  it('draws no glow without a selection, so the saved photo stays clean', () => {
    const b = mk();
    renderEditor(b.ctx as never, { width: 500, height: 500 }, [st(1, 100, 100)], images, null);
    expect(b.calls).not.toContain('glow');
    renderEditor(b.ctx as never, { width: 500, height: 500 }, [st(1, 100, 100)], images);
    expect(b.calls).not.toContain('glow');
  });
});

describe('mirror', () => {
  it('flipSticker toggles the flip flag', () => {
    const s = st(1, 10, 10);
    expect(flipSticker(s).flip).toBe(true);
    expect(flipSticker(flipSticker(s)).flip).toBe(false);
  });

  it('renderEditor mirrors a flipped sticker with a negative x scale', () => {
    const calls: string[] = [];
    const ctx = {
      canvas: { width: 0, height: 0 }, clearRect() {}, drawImage() { calls.push('draw'); }, save() {}, restore() {},
      translate() {}, rotate() {}, scale(x: number, y: number) { calls.push(`scale:${x},${y}`); }, strokeRect() {}, shadowBlur: 0, shadowColor: '', strokeStyle: '', lineWidth: 0,
    };
    const images = new Map<string, CanvasImageSource>([['/editor/pimple.svg', { width: 100, height: 100 } as unknown as CanvasImageSource]]);
    renderEditor(ctx as never, { width: 500, height: 500 }, [{ ...st(1, 100, 100), flip: true }, st(2, 200, 200)], images);
    expect(calls.filter((c) => c === 'scale:-1,1')).toHaveLength(1);
  });
});

describe('inside', () => {
  const box = { left: 300, top: 700, right: 372, bottom: 772 };
  it('is true on the button and in the room around it', () => {
    expect(inside(box, 336, 736)).toBe(true);
    expect(inside(box, 290, 690, 24)).toBe(true); // a finger covers the button: near is enough
    expect(inside(box, 396, 796, 24)).toBe(true);
  });
  it('is false away from the button', () => {
    expect(inside(box, 200, 736)).toBe(false);
    expect(inside(box, 336, 600, 24)).toBe(false);
    expect(inside(box, 290, 690)).toBe(false);
  });
});

describe('three fingers turn a sticker in depth', () => {
  const flat = st(1, 100, 100, 200), solid: EditorSticker = { ...st(2, 100, 100, 200), model: 'crown' };
  it('finds the middle of the fingers', () => {
    expect(centre([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 60 }])).toEqual({ x: 10, y: 20 });
  });
  it('a way to the right turns the front to the right, a way down tips the top to the viewer', () => {
    const s = tilt(solid, 50, 0, 1000);
    expect(s.yaw).toBeGreaterThan(0); expect(s.pitch ?? 0).toBe(0);
    const d = tilt(solid, 0, 50, 1000);
    expect(d.pitch).toBeGreaterThan(0); expect(d.yaw ?? 0).toBe(0);
    expect(tilt(solid, -50, -50, 1000).yaw).toBeLessThan(0);
  });
  it('a way over the short side of the photo is half a turn', () => {
    expect(tilt(solid, 360, 0, 720).yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(tilt(tilt(solid, 100, 0, 720), 80, 0, 720).yaw).toBeCloseTo(Math.PI * 180 / 720, 6); // the ways add
  });
  it('a 3D prop turns all the way round, and tips as far as its top or its bottom', () => {
    expect(Math.abs(tilt(solid, 5000, 0, 720).yaw!)).toBeLessThanOrEqual(Math.PI);
    expect(tilt(solid, 0, 5000, 720).pitch).toBeCloseTo(Math.PI / 2, 6);
    expect(tilt(solid, 0, -5000, 720).pitch).toBeCloseTo(-Math.PI / 2, 6);
    const round = tilt(solid, 1440, 0, 720); // two half turns: as at the start
    expect(Math.cos(round.yaw!)).toBeCloseTo(1, 6); expect(Math.sin(round.yaw!)).toBeCloseTo(0, 6);
  });
  it('a flat sticker tilts like a card, and never as far as its edge: it stays in view', () => {
    expect(MAX_TILT).toBeLessThan(Math.PI / 2 - 0.2);
    const s = tilt(flat, 5000, -5000, 720);
    expect(s.yaw).toBeCloseTo(MAX_TILT, 6); expect(s.pitch).toBeCloseTo(-MAX_TILT, 6);
  });
  it('keeps place, size, turn in the plane and the mirror', () => {
    expect(tilt({ ...flat, rot: 0.4, flip: true }, 10, 10, 720)).toMatchObject({ x: 100, y: 100, scale: 200, rot: 0.4, flip: true });
  });
});

describe('renderEditor with stickers that are turned in depth', () => {
  const mk = () => {
    const calls: string[] = [];
    const ctx = {
      canvas: { width: 0, height: 0 }, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, strokeRect() { calls.push('glow'); },
      shadowBlur: 0, shadowColor: '', strokeStyle: '', lineWidth: 0,
      drawImage: (img: { tag?: string }, ...a: number[]) => calls.push(`${img.tag ?? 'photo'}:${a.join(',')}`),
    };
    return { ctx, calls };
  };
  const flatImg = { width: 200, height: 100, tag: 'flat' } as unknown as CanvasImageSource, shotImg = { width: 512, height: 512, tag: 'shot' } as unknown as CanvasImageSource;
  const images = new Map([['/editor/pimple.svg', flatImg]]);
  const photo = { width: 1000, height: 1000 };

  it('a flat sticker with no tilt is drawn as before, the 3D renderer is not asked', () => {
    const m = mk(); let asked = 0;
    renderEditor(m.ctx as never, photo, [st(1, 500, 500, 200)], images, null, () => { asked++; return shotImg; });
    expect(asked).toBe(0);
    expect(m.calls).toContain('flat:-100,-50,200,100');
  });
  it('a tilted flat sticker is drawn from the shot, its width on the photo stays', () => {
    const m = mk(); const seen: EditorSticker[] = [];
    renderEditor(m.ctx as never, photo, [{ ...st(1, 500, 500, 200), yaw: 0.5 }], images, null, (s) => { seen.push(s); return shotImg; });
    expect(seen.map((s) => s.id)).toEqual([1]);
    const d = 200 * 2 * FRAME; // the shot shows FRAME units to every side, one unit is the long side of the sticker: 200 px
    expect(m.calls).toContain(`shot:${-d / 2},${-d / 2},${d},${d}`);
    expect(m.calls.some((c) => c.startsWith('flat:'))).toBe(false);
  });
  it('a high flat sticker: the unit of the shot is its long side', () => {
    const m = mk();
    const high = new Map([['/editor/pimple.svg', { width: 100, height: 200, tag: 'flat' } as unknown as CanvasImageSource]]);
    renderEditor(m.ctx as never, photo, [{ ...st(1, 500, 500, 100), pitch: 0.3 }], high, null, () => shotImg);
    const d = 200 * 2 * FRAME; // width 100 px on the photo, so the long side is 200 px
    expect(m.calls).toContain(`shot:${-d / 2},${-d / 2},${d},${d}`);
  });
  it('a 3D prop is drawn from the shot, with no tilt too. Its long side is the size of the sticker', () => {
    const m = mk();
    renderEditor(m.ctx as never, photo, [{ ...st(1, 500, 500, 300), src: '/props3d/crown-chip.webp', model: 'crown' }], images, 1, () => shotImg);
    const d = 300 * 2 * FRAME;
    expect(m.calls).toContain(`shot:${-d / 2},${-d / 2},${d},${d}`);
    expect(m.calls.filter((c) => c === 'glow')).toHaveLength(1);
  });
  it('with no 3D renderer a tilted flat sticker is drawn flat, and a 3D prop is left out', () => {
    const m = mk();
    const list = [{ ...st(1, 500, 500, 200), yaw: 0.5 }, { ...st(2, 500, 500, 300), src: '/props3d/crown-chip.webp', model: 'crown' }];
    renderEditor(m.ctx as never, photo, list, images, null, () => null);
    expect(m.calls.filter((c) => !c.startsWith('photo'))).toEqual(['flat:-100,-50,200,100']);
    const n = mk();
    renderEditor(n.ctx as never, photo, list, images);
    expect(n.calls.filter((c) => !c.startsWith('photo'))).toEqual(['flat:-100,-50,200,100']);
  });
});
