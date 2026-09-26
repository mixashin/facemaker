import { describe, it, expect } from 'vitest';
import { RecordCanvas } from './recordCanvas';

function fakeDoc() {
  const calls: unknown[][] = [];
  const tracks: unknown[] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...a: unknown[]) => calls.push(a) }),
    captureStream: (fps: number) => ({ fps, addTrack: (t: unknown) => tracks.push(t) }),
  };
  return { doc: { createElement: () => canvas } as unknown as Pick<Document, 'createElement'>, canvas, calls, tracks };
}

describe('RecordCanvas', () => {
  it('has the size of what the screen shows, in even numbers', () => {
    const f = fakeDoc();
    // 1280x720 stage in a 380x860 view: full height, width 720 * 380 / 860 = 318.1
    new RecordCanvas({ width: 1280, height: 720 }, { width: 380, height: 860 }, f.doc);
    expect([f.canvas.width, f.canvas.height]).toEqual([318, 720]);
  });

  it('draws the visible crop of the stage over the whole record canvas', () => {
    const f = fakeDoc();
    const stage = { width: 1280, height: 720 };
    const rc = new RecordCanvas(stage, { width: 380, height: 860 }, f.doc);
    rc.draw(stage as unknown as CanvasImageSource);
    const [src, sx, sy, sw, sh, dx, dy, dw, dh] = f.calls[0] as number[];
    expect(src).toBe(stage);
    expect(sx).toBeCloseTo((1280 - 720 * 380 / 860) / 2, 6);
    expect(sy).toBe(0);
    expect(sw).toBeCloseTo(720 * 380 / 860, 6);
    expect(sh).toBe(720);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 318, 720]);
  });

  it('streams at 30 fps and adds the voice track when there is one', () => {
    const f = fakeDoc();
    const rc = new RecordCanvas({ width: 640, height: 480 }, { width: 640, height: 480 }, f.doc);
    const track = { kind: 'audio' };
    const s = rc.stream(30, { getAudioTracks: () => [track] } as unknown as MediaStream) as unknown as { fps: number };
    expect(s.fps).toBe(30);
    expect(f.tracks).toEqual([track]);
  });

  it('streams video only when the mic is missing or denied', () => {
    const f = fakeDoc();
    const rc = new RecordCanvas({ width: 640, height: 480 }, { width: 640, height: 480 }, f.doc);
    rc.stream(30, null);
    rc.stream(30, { getAudioTracks: () => [] } as unknown as MediaStream);
    expect(f.tracks).toEqual([]);
  });
});
