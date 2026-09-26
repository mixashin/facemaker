import { describe, it, expect, vi } from 'vitest';
import { createConfirm } from './confirm';

describe('createConfirm', () => {
  it('runs the action only on the second tap within the timeout', () => {
    vi.useFakeTimers();
    const c = createConfirm(3000);
    let ran = 0;
    c.tap(() => ran++);
    expect(ran).toBe(0); expect(c.armed.value).toBe(true);
    c.tap(() => ran++);
    expect(ran).toBe(1); expect(c.armed.value).toBe(false);
    vi.useRealTimers();
  });

  it('disarms by itself after the timeout', () => {
    vi.useFakeTimers();
    const c = createConfirm(3000);
    let ran = 0;
    c.tap(() => ran++);
    vi.advanceTimersByTime(3001);
    expect(c.armed.value).toBe(false);
    c.tap(() => ran++);
    expect(ran).toBe(0);
    vi.useRealTimers();
  });

  it('cancel disarms', () => {
    const c = createConfirm(3000);
    c.tap(() => {});
    c.cancel();
    expect(c.armed.value).toBe(false);
  });
});
