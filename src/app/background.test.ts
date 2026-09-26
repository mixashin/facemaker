import { describe, it, expect } from 'vitest';
import { pauseWhenHidden } from './background';

function fakeDoc() {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    addEventListener(type: string, f: () => void) { expect(type).toBe('visibilitychange'); listeners.add(f); },
    removeEventListener(type: string, f: () => void) { expect(type).toBe('visibilitychange'); listeners.delete(f); },
    fire() { listeners.forEach((f) => f()); },
    count: () => listeners.size,
  };
}
const media = () => ({ pauses: 0, pause() { this.pauses++; } });
type Doc = Parameters<typeof pauseWhenHidden>[1];

describe('pauseWhenHidden', () => {
  it('pauses the video when the kid switches to another app', () => {
    const doc = fakeDoc(), m = media();
    pauseWhenHidden(() => m, doc as unknown as Doc);
    doc.hidden = true; doc.fire();
    expect(m.pauses).toBe(1);
  });

  it('does not touch the video when the app comes back: it stays paused until a tap', () => {
    const doc = fakeDoc(), m = media();
    pauseWhenHidden(() => m, doc as unknown as Doc);
    doc.hidden = true; doc.fire();
    doc.hidden = false; doc.fire();
    expect(m.pauses).toBe(1);
  });

  it('reads the media at the moment of the switch, so a video that loaded later is paused too', () => {
    const doc = fakeDoc();
    let current: ReturnType<typeof media> | null = null;
    pauseWhenHidden(() => current, doc as unknown as Doc);
    doc.hidden = true; doc.fire(); // nothing loaded yet: no error
    current = media();
    doc.fire();
    expect(current.pauses).toBe(1);
  });

  it('stops listening after the cleanup', () => {
    const doc = fakeDoc(), m = media();
    const off = pauseWhenHidden(() => m, doc as unknown as Doc);
    expect(doc.count()).toBe(1);
    off();
    expect(doc.count()).toBe(0);
    doc.hidden = true; doc.fire();
    expect(m.pauses).toBe(0);
  });
});
