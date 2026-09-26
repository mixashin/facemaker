import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHold, type HoldEvent } from './hold';

let events: HoldEvent[];
const mk = () => createHold((e) => events.push(e), 350);

beforeEach(() => { events = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('createHold', () => {
  it('a short press is a tap', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(200); h.up();
    expect(events).toEqual(['tap']);
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(['tap']);
  });

  it('a long press starts a hold at the threshold and ends it on release', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(349);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(['holdStart']);
    vi.advanceTimersByTime(5000); h.up();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('a cancelled short press does nothing: no photo when the finger slides off', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(100); h.cancel();
    vi.advanceTimersByTime(1000);
    expect(events).toEqual([]);
  });

  it('a cancelled hold still ends, so a recording never runs on', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(400); h.cancel();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('ignores a second down and a stray up', () => {
    const h = mk();
    h.up(); h.cancel();
    h.down(); h.down(); vi.advanceTimersByTime(400); h.up(); h.up();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('works again after each gesture', () => {
    const h = mk();
    h.down(); h.up();
    h.down(); vi.advanceTimersByTime(400); h.up();
    h.down(); h.up();
    expect(events).toEqual(['tap', 'holdStart', 'holdEnd', 'tap']);
  });
});
