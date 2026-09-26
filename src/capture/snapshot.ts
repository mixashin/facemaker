export type Crop = { x: number; y: number; w: number; h: number };

// The stage canvas is shown with object-fit: cover, so the screen shows a centred crop of it.
// The saved photo must match what the kid saw: the same crop, at canvas resolution.
export function coverCrop(cw: number, ch: number, ew: number, eh: number): Crop {
  if (!(ew > 0 && eh > 0)) return { x: 0, y: 0, w: cw, h: ch };
  const ca = cw / ch, ea = ew / eh;
  if (Math.abs(ca - ea) < 1e-6) return { x: 0, y: 0, w: cw, h: ch };
  if (ca > ea) { const w = ch * ea; return { x: (cw - w) / 2, y: 0, w, h: ch }; }
  const h = cw / ea; return { x: 0, y: (ch - h) / 2, w: cw, h };
}

export function snapshot(canvas: HTMLCanvasElement, quality = 0.92, view?: { width: number; height: number }): Promise<File> {
  const c = coverCrop(canvas.width, canvas.height, view?.width ?? 0, view?.height ?? 0);
  let source: HTMLCanvasElement = canvas;
  if (c.w !== canvas.width || c.h !== canvas.height) {
    const out = document.createElement('canvas');
    out.width = Math.round(c.w); out.height = Math.round(c.h);
    out.getContext('2d')!.drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, out.width, out.height);
    source = out;
  }
  return new Promise((resolve, reject) => {
    source.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob returned null'));
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      resolve(new File([blob], `facemaker-${ts}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });
}
