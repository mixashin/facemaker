export type P = { x: number; y: number };
// rot: the turn in the plane of the photo. yaw and pitch: the turn in depth (three fingers). model: a 3D prop
// (id in src/filters/props3d.ts), src is its chip picture then.
export type EditorSticker = { id: number; src: string; x: number; y: number; scale: number; rot: number; flip?: boolean; yaw?: number; pitch?: number; model?: string };
// The picture of a sticker that is turned in depth (src/editor/shots.ts), or null when there is none
export type Shot = (s: EditorSticker) => CanvasImageSource | null;
export type PaletteItem = { id: string; src: string; model?: string };
export type Ctx = Pick<CanvasRenderingContext2D, 'drawImage' | 'save' | 'restore' | 'translate' | 'rotate' | 'clearRect' | 'strokeRect' | 'scale' | 'shadowBlur' | 'shadowColor' | 'strokeStyle' | 'lineWidth'> & { canvas: { width: number; height: number } };

import props from '../filters/props.json';
import { PROPS3D } from '../filters/props3d';

// 3D props by Astra first (CC0, brief R5), then her flat props (brief R3), then emoji art.
export const EDITOR_STICKERS: PaletteItem[] = [
  ...PROPS3D.map((p) => ({ id: '3d-' + p.id, src: p.chip, model: p.id })),
  ...(props as string[]).map((id) => ({ id, src: `/props/${id}.webp` })),
  { id: 'sunglasses', src: '/stickers/1f576.svg' },
  { id: 'cap', src: '/stickers/1f9e2.svg' },
  { id: 'tophat', src: '/stickers/1f3a9.svg' },
  { id: 'crown', src: '/stickers/1f451.svg' },
  { id: 'party', src: '/stickers/1f389.svg' },
  { id: 'eyes', src: '/stickers/1f440.svg' },
  { id: 'clownnose', src: '/stickers/1f534.svg' },
  { id: 'clown', src: '/stickers/1f921.svg' },
  // Fluent Emoji (MIT)
  { id: 'gradcap', src: '/stickers/fluent/1f393.svg' },
  { id: 'sunhat', src: '/stickers/fluent/1f452.svg' },
  { id: 'ribbon', src: '/stickers/fluent/1f380.svg' },
  { id: 'star', src: '/stickers/fluent/1f31f.svg' },
  { id: 'rainbow', src: '/stickers/fluent/1f308.svg' },
  { id: 'butterfly', src: '/stickers/fluent/1f98b.svg' },
];

const MIN_SCALE = 16;
// A flat sticker tilts 75 degrees at most: at 90 degrees a card is a line, and the child loses it
export const MAX_TILT = 1.3;
// A shot shows this many units to every side of the middle of the sticker. One unit is the long side of the
// sticker, so the sticker fits in the shot in every turn.
export const FRAME = 0.9;

// Is the finger on a button (screen pixels), or within pad of it? For the trash can under a dragged sticker.
export function inside(r: { left: number; top: number; right: number; bottom: number }, x: number, y: number, pad = 0): boolean {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

// object-fit: contain. The image is centred in the element with letterboxing.
export function elementToImage(ex: number, ey: number, imgW: number, imgH: number, elW: number, elH: number): P {
  const k = Math.min(elW / imgW, elH / imgH);
  const ox = (elW - imgW * k) / 2, oy = (elH - imgH * k) / 2;
  return { x: (ex - ox) / k, y: (ey - oy) / k };
}

export function hitTest(stickers: EditorSticker[], p: P): EditorSticker | null {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    if (Math.hypot(p.x - s.x, p.y - s.y) <= s.scale / 2) return s;
  }
  return null;
}

export function moveTo(s: EditorSticker, p: P): EditorSticker { return { ...s, x: p.x, y: p.y }; }

export function flipSticker(s: EditorSticker): EditorSticker { return { ...s, flip: !s.flip }; }

export function pinch(s: EditorSticker, a0: P, b0: P, a1: P, b1: P): EditorSticker {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return { ...s, x: s.x + (m1.x - m0.x), y: s.y + (m1.y - m0.y), scale: Math.max(MIN_SCALE, s.scale * (d1 / d0)), rot: s.rot + (ang1 - ang0) };
}

export function centre(ps: P[]): P {
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
// Three fingers turn the sticker in depth, as a finger turns a ball: a way to the right turns the front to the
// right, a way down tips the top to the viewer. dx, dy: the way of the middle of the fingers in photo pixels.
// span: the short side of the photo, a way that long is half a turn. A 3D prop turns all the way round.
// Yaw and pitch act in the frame of the sticker, and the canvas turns the sticker in the plane after that
// (rot). So the way of the fingers is taken into the frame of the sticker first.
export function tilt(s: EditorSticker, dx: number, dy: number, span: number): EditorSticker {
  const c = Math.cos(s.rot), n = Math.sin(s.rot), k = Math.PI / (span || 1);
  const yaw = (s.yaw ?? 0) + (c * dx + n * dy) * k, pitch = (s.pitch ?? 0) + (c * dy - n * dx) * k;
  if (!s.model) return { ...s, yaw: clamp(yaw, MAX_TILT), pitch: clamp(pitch, MAX_TILT) };
  return { ...s, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch: clamp(pitch, Math.PI / 2) };
}

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const a = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const w = a.naturalWidth || a.width || 1, h = a.naturalHeight || a.height || 1;
  return { w, h };
}

// Draws at the image's own resolution. `images` holds a decoded image per sticker src. Missing ones are skipped.
// Setting the canvas size resets the bitmap and the full-size photo draw covers every pixel, so no clearRect is needed.
// selectedId draws a soft glow box around that sticker. Pass null when rendering for the saved file.
// shot gives the picture of a sticker that is turned in depth. Without it a flat sticker is drawn flat, and a
// 3D prop is left out.
export function renderEditor(ctx: Ctx, image: { width: number; height: number }, stickers: EditorSticker[], images: Map<string, CanvasImageSource>, selectedId: number | null = null, shot?: Shot): void {
  ctx.canvas.width = image.width; ctx.canvas.height = image.height;
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, image.width, image.height);
  for (const s of stickers) {
    const flat = s.model ? undefined : images.get(s.src);
    const turned = s.model || s.yaw || s.pitch ? shot?.(s) ?? null : null;
    const img = turned ?? flat;
    if (!img) continue;
    const { w, h } = flat ? sizeOf(flat) : { w: 1, h: 1 };
    const sw = s.scale, sh = (s.scale * h) / w;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    if (s.flip) ctx.scale(-1, 1);
    if (turned) {
      const d = Math.max(sw, sh) * 2 * FRAME;
      ctx.drawImage(turned, -d / 2, -d / 2, d, d);
    } else ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    if (s.id === selectedId) {
      const pad = Math.max(6, s.scale * 0.06);
      ctx.shadowColor = '#ff4fa3';
      ctx.shadowBlur = Math.max(12, s.scale * 0.2);
      ctx.strokeStyle = 'rgba(255, 255, 255, .9)';
      ctx.lineWidth = Math.max(3, s.scale / 40);
      ctx.strokeRect(-sw / 2 - pad, -sh / 2 - pad, sw + 2 * pad, sh + 2 * pad);
    }
    ctx.restore();
  }
}
