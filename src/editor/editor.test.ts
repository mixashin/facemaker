import { describe, it, expect } from 'vitest';
import { EDITOR_STICKERS, elementToImage, hitTest, moveTo, pinch, flipSticker, renderEditor, type EditorSticker, inside } from './editor';
import { existsSync } from 'node:fs';

const st = (id: number, x: number, y: number, scale = 100, rot = 0): EditorSticker => ({ id, src: '/editor/pimple.svg', x, y, scale, rot });

describe('editor assets', () => {
  it('every palette entry has a file under public', () => {
    expect(EDITOR_STICKERS.length).toBeGreaterThanOrEqual(40);
    for (const s of EDITOR_STICKERS) expect(existsSync('public' + s.src), s.id).toBe(true);
    expect(new Set(EDITOR_STICKERS.map((s) => s.id)).size).toBe(EDITOR_STICKERS.length);
    expect(EDITOR_STICKERS.slice(0, 3).every((s) => s.src.startsWith('/props/'))).toBe(true); // the props by Astra come first
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
