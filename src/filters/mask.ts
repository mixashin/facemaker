// Person mask of the selfie segmenter (M4c): sizes and smoothing over time.
export const MASK_EDGE = 256; // the model works at 256 x 256: a larger frame costs time and adds nothing

export function inputSize(w: number, h: number): [number, number] {
  const k = Math.min(1, MASK_EDGE / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}

const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)); // the model can leave 0 to 1 by a little

// The mask of the model (1 is person) as bytes, smoothed over time. Hair and fingers flicker from frame to
// frame. A share of the mask before stays: less flicker, a little lag.
export class MaskSmoother {
  private last: Uint8Array | null = null;
  private w = 0;
  private h = 0;

  constructor(private keep = 0.4) {}

  push(mask: Float32Array, w: number, h: number): Uint8Array {
    const first = !this.last || this.w !== w || this.h !== h || this.last.length !== mask.length;
    if (first) { this.last = new Uint8Array(mask.length); this.w = w; this.h = h; }
    const out = this.last!, k = first ? 0 : this.keep;
    for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * k + byte(mask[i]) * (1 - k));
    return out;
  }

  reset(): void { this.last = null; }
}
