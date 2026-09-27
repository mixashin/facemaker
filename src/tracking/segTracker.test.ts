import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { SegTracker } from './segTracker';

type Msg = { type: string; [k: string]: unknown };
class FakeWorker {
  static all: FakeWorker[] = [];
  posted: Msg[] = [];
  ended = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor() { FakeWorker.all.push(this); }
  postMessage(m: Msg) {
    this.posted.push(m);
    if (m.type === 'init') setTimeout(() => this.say({ type: 'ready' }), 5);
  }
  say(data: unknown) { if (!this.ended) this.onmessage?.({ data }); }
  onerror: ((e: { message: string }) => void) | null = null;
  mask(v: number, width = 4, height = 3) { this.say({ type: 'mask', mask: new Float32Array(width * height).fill(v / 255), width, height, ts: 0 }); }
  frames() { return this.posted.filter((m) => m.type === 'frame'); }
  terminate() { this.ended = true; }
}
const asked: { resizeWidth?: number; resizeHeight?: number }[] = [];
let bitmaps: { resolve: (b: unknown) => void; reject: (e: unknown) => void }[] = [];
let held = false; // hold the bitmaps back, the test lets them go
const video = { readyState: 4, videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  FakeWorker.all = [];
  asked.length = 0;
  bitmaps = [];
  held = false;
  (globalThis as any).Worker = FakeWorker;
  (globalThis as any).createImageBitmap = (_v: unknown, o: { resizeWidth?: number; resizeHeight?: number }) => {
    asked.push(o);
    return held ? new Promise((resolve, reject) => bitmaps.push({ resolve, reject })) : Promise.resolve({ close() {} });
  };
});

function setup() {
  const masks: number[][] = [], errors: string[] = [];
  const t = new SegTracker({ onMask: (m) => masks.push([...m]), onError: (e) => errors.push(e) });
  return { t, masks, errors, w: () => FakeWorker.all.at(-1)! };
}

describe('SegTracker', () => {
  it('makes no worker until it starts, and one worker for two starts', () => {
    const s = setup();
    expect(FakeWorker.all).toHaveLength(0);
    expect(s.t.running).toBe(false);
    s.t.start(); s.t.start();
    expect(FakeWorker.all).toHaveLength(1);
    expect(s.t.running).toBe(true);
    s.t.stop();
  });

  it('sends no frame before the worker is ready', async () => {
    const s = setup();
    s.t.start();
    s.t.push(video, 0);
    await tick(1);
    expect(s.w().frames()).toHaveLength(0);
    await tick(15);
    s.t.push(video, 33);
    await tick(1);
    expect(s.w().frames()).toHaveLength(1);
    s.t.stop();
  });

  it('sends a small copy of the frame: long side 256, same aspect', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.t.push(video, 33); await tick(1);
    expect(asked[0]).toMatchObject({ resizeWidth: 256, resizeHeight: 144 });
    s.t.stop();
  });

  it('drops frames while one is in work', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.t.push(video, 33); s.t.push(video, 66); s.t.push(video, 99);
    await tick(1);
    expect(s.w().frames()).toHaveLength(1);
    s.w().mask(255);
    s.t.push(video, 133); await tick(1);
    expect(s.w().frames()).toHaveLength(2);
    s.t.stop();
  });

  it('gives the mask, smoothed over time', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.w().mask(0); s.w().mask(255);
    expect(s.masks[0][0]).toBe(0);
    expect(s.masks[1][0]).toBeGreaterThan(100);
    expect(s.masks[1][0]).toBeLessThan(255);
    s.t.stop();
  });

  it('is free for the next frame after an error', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.t.push(video, 33); await tick(1);
    s.w().say({ type: 'error', message: 'no mask' });
    expect(s.errors).toEqual(['no mask']);
    s.t.push(video, 66); await tick(1);
    expect(s.w().frames()).toHaveLength(2);
    s.t.stop();
  });

  it('stops the worker, and a late mask calls nothing', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    const w = s.w();
    s.t.stop();
    expect(w.ended).toBe(true);
    expect(s.t.running).toBe(false);
    w.ended = false; // a message that was on its way
    w.mask(255);
    expect(s.masks).toHaveLength(0);
    s.t.push(video, 33); await tick(1);
    expect(w.frames()).toHaveLength(0);
  });

  it('hears a worker that dies without a message', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.t.push(video, 33); await tick(1);
    s.w().onerror!({ message: 'importScripts failed' });
    expect(s.errors).toEqual(['importScripts failed']);
    s.t.push(video, 66); await tick(1);
    expect(s.w().frames()).toHaveLength(2); // free for the next frame
    s.t.stop();
  });

  it('a frame of the worker before does not free the new worker', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    held = true;
    s.t.push(video, 33); // the bitmap is on its way
    s.t.stop(); s.t.start(); await tick(15);
    held = false;
    s.t.push(video, 66); await tick(1); // the new worker has one frame in work
    expect(s.w().frames()).toHaveLength(1);
    bitmaps[0].reject(new Error('late'));
    await tick(1);
    s.t.push(video, 99); await tick(1);
    expect(s.w().frames()).toHaveLength(1); // still one: the late failure was not its own
    s.t.stop();
  });

  it('gives up after many errors in a row, with one last message', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    for (let i = 0; i < 40 && s.t.running; i++) { s.t.push(video, 33 * i); await tick(1); s.w().say({ type: 'error', message: 'no mask' }); }
    expect(s.t.running).toBe(false);
    expect(s.errors.length).toBeLessThanOrEqual(31);
    expect(s.errors.at(-1)).toMatch(/stopped/);
  });

  it('starts fresh after a stop: a new worker, no mix with the mask before', async () => {
    const s = setup();
    s.t.start(); await tick(15);
    s.w().mask(0);
    s.t.stop();
    s.t.start(); await tick(15);
    expect(FakeWorker.all).toHaveLength(2);
    s.w().mask(255);
    expect(s.masks.at(-1)![0]).toBe(255);
    s.t.stop();
  });
});

describe('worker guards', () => {
  it('both workers fence the network before they load MediaPipe', () => {
    const fence = (file: string) => {
      const src = readFileSync(file, 'utf8');
      const from = src.indexOf('const origin = self.location.origin'), to = src.indexOf('declare const Vision'), load = src.indexOf('importScripts(');
      expect(from, file).toBeGreaterThan(-1);
      expect(to, file).toBeGreaterThan(from);
      expect(load, file).toBeGreaterThan(to); // the fence stands before MediaPipe loads
      return src.slice(from, to);
    };
    const face = fence('src/tracking/face.worker.ts');
    expect(face).toContain('self.fetch = ');
    expect(face).toContain('u.origin === origin ? nativeFetch(input, init) : Promise.reject');
    expect(face).toContain('XMLHttpRequest.prototype.open = ');
    expect(face).toContain('if (u.origin !== origin) throw');
    expect(fence('src/tracking/seg.worker.ts')).toBe(face); // one fence, word for word
  });
});
