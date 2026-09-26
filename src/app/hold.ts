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
