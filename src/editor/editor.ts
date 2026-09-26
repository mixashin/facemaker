export type P = { x: number; y: number };
export type EditorSticker = { id: number; src: string; x: number; y: number; scale: number; rot: number; flip?: boolean };
export type Ctx = Pick<CanvasRenderingContext2D, 'drawImage' | 'save' | 'restore' | 'translate' | 'rotate' | 'clearRect' | 'strokeRect' | 'scale' | 'shadowBlur' | 'shadowColor' | 'strokeStyle' | 'lineWidth'> & { canvas: { width: number; height: number } };

export const EDITOR_STICKERS: { id: string; src: string }[] = [
  { id: 'moustache', src: '/editor/moustache.svg' },
  { id: 'eyepatch', src: '/editor/eyepatch.svg' },
  { id: 'piratehat', src: '/editor/piratehat.svg' },
  { id: 'googly', src: '/editor/googly.svg' },
  { id: 'pimple', src: '/editor/pimple.svg' },
  { id: 'sunglasses', src: '/stickers/1f576.svg' },
  { id: 'cap', src: '/stickers/1f9e2.svg' },
  { id: 'tophat', src: '/stickers/1f3a9.svg' },
  { id: 'crown', src: '/stickers/1f451.svg' },
  { id: 'party', src: '/stickers/1f389.svg' },
  { id: 'eyes', src: '/stickers/1f440.svg' },
  { id: 'clownnose', src: '/stickers/1f534.svg' },
  { id: 'clown', src: '/stickers/1f921.svg' },
];

const MIN_SCALE = 16;

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

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const a = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const w = a.naturalWidth || a.width || 1, h = a.naturalHeight || a.height || 1;
  return { w, h };
}

// Draws at the image's own resolution. `images` holds a decoded image per sticker src. Missing ones are skipped.
// Setting the canvas size resets the bitmap and the full-size photo draw covers every pixel, so no clearRect is needed.
// selectedId draws a soft glow box around that sticker. Pass null when rendering for the saved file.
export function renderEditor(ctx: Ctx, image: { width: number; height: number }, stickers: EditorSticker[], images: Map<string, CanvasImageSource>, selectedId: number | null = null): void {
  ctx.canvas.width = image.width; ctx.canvas.height = image.height;
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, image.width, image.height);
  for (const s of stickers) {
    const img = images.get(s.src);
    if (!img) continue;
    const { w, h } = sizeOf(img);
    const sw = s.scale, sh = (s.scale * h) / w;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    if (s.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
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
