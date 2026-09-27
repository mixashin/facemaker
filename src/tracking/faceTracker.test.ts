import { describe, it, expect } from 'vitest';
import { FaceTracker } from './faceTracker';
import type { FaceResult } from './types';

function result(count: number, fill = 0.5): FaceResult {
  const landmarks = new Float32Array(2 * 478 * 3).fill(fill);
  return { landmarks, count, matrices: new Float32Array(count * 16), blend: new Float32Array(count * 52), width: 640, height: 480 };
}

describe('FaceTracker.smooth', () => {
  it('returns one Face per detected face', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    expect(t.smooth(result(2), 0)).toHaveLength(2);
    expect(t.smooth(result(1), 33)).toHaveLength(1);
  });

  it('returns [] after 10 empty frames and resets state', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.smooth(result(1, 0.2), 0);
    for (let i = 1; i <= 10; i++) t.smooth(result(0), i * 33);
    expect(t.smooth(result(0), 11 * 33)).toEqual([]);
    const fresh = t.smooth(result(1, 0.9), 12 * 33);
    expect(fresh[0].landmarks[0]).toBeCloseTo(0.9, 4);
  });

  it('resets a face slot that went missing while the other stays smooth', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.smooth(result(2, 0.3), 0);
    t.smooth(result(1, 0.3), 33);
    const r = result(2, 0.3);
    r.landmarks.fill(0.9, 478 * 3);
    const faces = t.smooth(r, 66);
    expect(faces[1].landmarks[0]).toBeCloseTo(0.9, 4);
    expect(faces[0].landmarks[0]).toBeCloseTo(0.3, 4);
  });
});

describe('FaceTracker worker flow', () => {
  type Msg = { type: string; [k: string]: unknown };
  class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: Msg[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    ready = false;
    constructor() { FakeWorker.instances.push(this); }
    postMessage(m: Msg) {
      this.posted.push(m);
      if (m.type === 'init') setTimeout(() => { this.ready = true; this.onmessage?.({ data: { type: 'ready', delegate: 'CPU' } }); }, 5);
      else if (m.type === 'frame' && this.ready) setTimeout(() => this.onmessage?.({ data: { type: 'result', result: result(1), ts: m.ts } }), 0);
      // a frame before ready is dropped without a reply, like the real worker
    }
    terminate() {}
  }
  const video = { readyState: 4 } as unknown as HTMLVideoElement;
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('does not send frames before the worker is ready, then delivers results', async () => {
    (globalThis as any).Worker = FakeWorker;
    (globalThis as any).createImageBitmap = async () => ({ close() {} });
    const got: number[] = [];
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => got.push(f.length) });
    t.start();
    t.push(video, 0);
    const w = FakeWorker.instances.at(-1)!;
    expect(w.posted.filter((m) => m.type === 'frame')).toHaveLength(0);
    await tick(15);
    t.push(video, 33);
    await tick(5);
    expect(w.posted.filter((m) => m.type === 'frame')).toHaveLength(1);
    expect(got).toEqual([1]);
    t.push(video, 66);
    await tick(5);
    expect(got).toEqual([1, 1]);
    t.stop();
  });
});

describe('FaceTracker.smooth miss handling', () => {
  it('holds the last faces for 9 misses and clears at 10', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.smooth(result(1, 0.4), 0);
    for (let i = 1; i <= 9; i++) expect(t.smooth(result(0), i * 33)).toHaveLength(1);
    expect(t.smooth(result(0), 10 * 33)).toEqual([]);
  });
});

describe('FaceTracker.detectStill', () => {
  type Msg = { type: string; id?: number };
  class StillWorker {
    static last: StillWorker;
    posted: Msg[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor() { StillWorker.last = this; }
    postMessage(m: Msg) {
      this.posted.push(m);
      if (m.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready', delegate: 'CPU' } }), 5);
    }
    answer(id: number, landmarks: Float32Array | null) { this.onmessage?.({ data: { type: 'still', id, landmarks } }); }
    terminate() {}
  }
  const picture = () => { const b = { closed: false, close() { b.closed = true; } }; return b as unknown as ImageBitmap & { closed: boolean }; };
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started = async () => {
    (globalThis as any).Worker = StillWorker;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.start();
    await tick(15);
    return { t, w: StillWorker.last };
  };

  it('gives null and closes the picture when the worker is not ready', async () => {
    (globalThis as any).Worker = StillWorker;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    const p = picture();
    expect(await t.detectStill(p)).toBeNull();
    expect(p.closed).toBe(true);
  });

  it('sends the picture and gives each caller the answer with its own id', async () => {
    const { t, w } = await started();
    const a = t.detectStill(picture()), b = t.detectStill(picture());
    const sent = w.posted.filter((m) => m.type === 'still');
    expect(sent).toHaveLength(2);
    expect(sent[0].id).not.toBe(sent[1].id);
    const found = new Float32Array(478 * 3).fill(0.2);
    w.answer(sent[1].id!, found); // answers in the other order
    w.answer(sent[0].id!, null);
    expect(await b).toBe(found);
    expect(await a).toBeNull();
    t.stop();
  });

  it('gives null for open requests when the tracker stops', async () => {
    const { t } = await started();
    const p = t.detectStill(picture());
    t.stop();
    expect(await p).toBeNull();
  });

  it('does not disturb the video frames', async () => {
    const { t, w } = await started();
    const p = t.detectStill(picture());
    (globalThis as any).createImageBitmap = async () => ({ close() {} });
    t.push({ readyState: 4 } as unknown as HTMLVideoElement, 33);
    await tick(5);
    expect(w.posted.filter((m) => m.type === 'frame')).toHaveLength(1);
    w.answer(w.posted.find((m) => m.type === 'still')!.id!, null);
    await p;
    t.stop();
  });
});

describe('FaceTracker health', () => {
  type Msg = { type: string; [k: string]: unknown };
  class W {
    static all: W[] = [];
    static delegate = 'GPU';
    static silent = false; // a worker that never says ready
    posted: Msg[] = [];
    ended = false;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    constructor() { W.all.push(this); }
    postMessage(m: Msg) {
      this.posted.push(m);
      if (m.type === 'init' && !W.silent) setTimeout(() => this.say({ type: 'ready', delegate: m.prefer === 'CPU' ? 'CPU' : W.delegate }), 1);
    }
    say(data: unknown) { if (!this.ended) this.onmessage?.({ data }); }
    terminate() { this.ended = true; }
  }
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const video = { readyState: 4 } as unknown as HTMLVideoElement;
  function setup(prefer?: 'auto' | 'GPU' | 'CPU', startLimitMs?: number) {
    W.all = []; W.delegate = 'GPU'; W.silent = false;
    (globalThis as any).Worker = W;
    (globalThis as any).createImageBitmap = async () => ({ close() {} });
    const errors: string[] = [], ready: string[] = [];
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {}, onError: (m) => errors.push(m), onReady: (d) => ready.push(d), prefer, startLimitMs });
    return { t, errors, ready, w: () => W.all.at(-1)! };
  }

  it('tells the worker which tracker is asked for', async () => {
    const a = setup();
    a.t.start();
    expect(a.w().posted[0]).toMatchObject({ type: 'init', prefer: 'auto' });
    a.t.stop();
    const b = setup('CPU');
    b.t.start();
    expect(b.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    await tick(5);
    expect(b.t.health.delegate).toBe('CPU');
    b.t.stop();
  });

  it('counts results and errors', async () => {
    const s = setup();
    s.t.start(); await tick(5);
    s.w().say({ type: 'result', result: result(1), ts: 1 });
    s.w().say({ type: 'result', result: result(0), ts: 2 });
    s.w().say({ type: 'error', message: 'gl lost' });
    expect(s.t.health).toMatchObject({ delegate: 'GPU', results: 2, withFace: 1, errors: 1, lastError: 'gl lost' });
    expect(s.errors).toEqual(['gl lost']);
    s.t.stop();
  });

  it('goes to the CPU after five errors in a row on the GPU: a new worker, and frames go on', async () => {
    const s = setup();
    s.t.start(); await tick(5);
    const first = s.w();
    for (let i = 0; i < 5; i++) first.say({ type: 'error', message: 'gl lost' });
    expect(W.all).toHaveLength(2);
    expect(first.ended).toBe(true);
    expect(s.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    await tick(5);
    expect(s.t.health.delegate).toBe('CPU');
    expect(s.ready).toEqual(['GPU', 'CPU']);
    s.t.push(video, 100); await tick(2);
    expect(s.w().posted.filter((m) => m.type === 'frame')).toHaveLength(1);
    for (let i = 0; i < 10; i++) s.w().say({ type: 'error', message: 'x' });
    expect(W.all).toHaveLength(2); // one time only
    s.t.stop();
  });

  it('stays on the tracker that was forced', async () => {
    const s = setup('GPU');
    s.t.start(); await tick(5);
    for (let i = 0; i < 10; i++) s.w().say({ type: 'error', message: 'gl lost' });
    expect(W.all).toHaveLength(1);
    s.t.stop();
  });

  it('a worker that dies is an error, and the CPU takes over', async () => {
    const s = setup();
    s.t.start(); await tick(5);
    s.w().onerror?.({ message: 'Script error' });
    expect(s.errors[0]).toContain('Script error');
    expect(W.all).toHaveLength(2);
    expect(s.w().posted[0]).toMatchObject({ prefer: 'CPU' });
    s.t.stop();
  });

  it('a tracker that does not start in time is an error, and the CPU takes over', async () => {
    const s = setup('auto', 20);
    W.silent = true;
    s.t.start();
    await tick(40);
    expect(s.t.health.lastError).toContain('no start');
    expect(W.all).toHaveLength(2);
    s.t.stop();
    await tick(40);
    expect(W.all).toHaveLength(2); // stop() ends the wait
  });

  it('a frame with no answer does not block the tracker for ever', async () => {
    const s = setup();
    s.t.start(); await tick(5);
    s.t.push(video, 0); await tick(2);
    s.t.push(video, 1000); await tick(2);
    expect(s.w().posted.filter((m) => m.type === 'frame')).toHaveLength(1); // the first one is still out
    s.t.push(video, 6000); await tick(2);
    expect(s.t.health.lastError).toContain('no answer');
    s.t.push(video, 6033); await tick(2);
    expect(s.w().posted.filter((m) => m.type === 'frame')).toHaveLength(2);
    s.t.stop();
  });
});
