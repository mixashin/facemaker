// Person mask of the selfie segmenter (M4c): sizes and smoothing over time.
export const MASK_EDGE = 256; // the model works at 256 x 256: a larger frame costs time and adds nothing

export function inputSize(w: number, h: number): [number, number] {
  const k = Math.min(1, MASK_EDGE / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}

// Hair and fingers flicker from frame to frame. A share of the mask before stays: less flicker, a little lag.
export class MaskSmoother {
  private last: Uint8Array | null = null;
  private w = 0;
  private h = 0;

  constructor(private keep = 0.4) {}

  push(mask: Uint8Array, w: number, h: number): Uint8Array {
    if (!this.last || this.w !== w || this.h !== h || this.last.length !== mask.length) {
      this.last = mask.slice(); this.w = w; this.h = h;
      return this.last;
    }
    const out = this.last, k = this.keep;
    for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * k + mask[i] * (1 - k));
    return out;
  }

  reset(): void { this.last = null; }
}
