import { signal, type Signal } from '@preact/signals';

export type Confirm = { armed: Signal<boolean>; tap(action: () => void): void; cancel(): void };

// Two-tap confirmation for destructive buttons: first tap arms (button shows a question), second tap within timeoutMs runs.
export function createConfirm(timeoutMs = 3000): Confirm {
  const armed = signal(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { armed.value = false; if (timer) { clearTimeout(timer); timer = null; } };
  return {
    armed,
    cancel,
    tap(action) {
      if (armed.value) { cancel(); action(); return; }
      armed.value = true;
      timer = setTimeout(cancel, timeoutMs);
    },
  };
}
