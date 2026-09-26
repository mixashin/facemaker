export type HoldEvent = 'tap' | 'holdStart' | 'holdEnd';

// Tap or hold on one button. Short press: 'tap' on release. Long press: 'holdStart' at the threshold,
// 'holdEnd' on release or cancel. A cancelled short press is nothing.
export function createHold(onEvent: (e: HoldEvent) => void, thresholdMs = 350): { down(): void; up(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pressed = false, holding = false;
  const end = (tap: boolean) => {
    if (!pressed) return;
    pressed = false;
    if (timer !== null) { clearTimeout(timer); timer = null; if (tap) onEvent('tap'); }
    else if (holding) { holding = false; onEvent('holdEnd'); }
  };
  return {
    down() {
      if (pressed) return;
      pressed = true; holding = false;
      timer = setTimeout(() => { timer = null; holding = true; onEvent('holdStart'); }, thresholdMs);
    },
    up() { end(true); },
    cancel() { end(false); },
  };
}

// A hold that ends this soon after it started is a slow tap. The kid wanted a photo.
export const MIN_CLIP_MS = 700;
export function isRealClip(heldMs: number, minMs = MIN_CLIP_MS): boolean { return heldMs >= minMs; }
