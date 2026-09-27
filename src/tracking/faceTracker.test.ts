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
    static mode: 'ok' | 'silent' | 'no files' = 'ok'; // silent: the files load, the tracker never says ready
    posted: Msg[] = [];
    ended = false;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    constructor() { W.all.push(this); }
    postMessage(m: Msg) {
      this.posted.push(m);
      if (m.type !== 'init' || W.mode === 'no files') return;
      setTimeout(() => this.say({ type: 'loaded' }), 1);
      if (W.mode === 'ok') setTimeout(() => this.say({ type: 'ready', delegate: m.prefer === 'auto' ? 'GPU' : m.prefer }), 2);
    }
    say(data: unknown) { this.onmessage?.({ data }); } // a worker that was ended can still have a message on its way
    frames() { return this.posted.filter((m) => m.type === 'frame'); }
    terminate() { this.ended = true; }
  }
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const video = { readyState: 4 } as unknown as HTMLVideoElement;
  function setup(prefer?: 'auto' | 'GPU' | 'CPU', startLimitMs?: number) {
    W.all = []; W.mode = 'ok';
    (globalThis as any).Worker = W;
    (globalThis as any).createImageBitmap = async () => ({ close() {} });
    const errors: string[] = [], ready: string[] = [], faces: number[] = [];
    let now = 0;
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => faces.push(f.length), onError: (m) => errors.push(m), onReady: (d) => ready.push(d), prefer, startLimitMs, now: () => now });
    return { t, errors, ready, faces, w: () => W.all.at(-1)!, alive: () => W.all.filter((w) => !w.ended), at: (ms: number) => { now = ms; } };
  }
  const graphDies = (w: W, n = 5) => { for (let i = 0; i < n; i++) w.say({ type: 'error', message: i ? 'Graph has errors' : 'RET_CHECK failure in the face geometry' }); };

  it('tells the worker which tracker is asked for', async () => {
    const a = setup();
    a.t.start();
    expect(a.w().posted[0]).toMatchObject({ type: 'init', prefer: 'auto' });
    a.t.stop();
    const b = setup('CPU');
    b.t.start();
    expect(b.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    await tick(8);
    expect(b.t.health).toMatchObject({ delegate: 'CPU', files: true });
    b.t.stop();
  });

  it('counts results and errors', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    s.w().say({ type: 'result', result: result(1), ts: 1 });
    s.w().say({ type: 'result', result: result(0), ts: 2 });
    s.w().say({ type: 'error', message: 'gl lost' });
    expect(s.t.health).toMatchObject({ delegate: 'GPU', results: 2, withFace: 1, errors: 1, lastError: 'gl lost' });
    expect(s.errors).toEqual(['gl lost']);
    s.t.stop();
  });

  it('a graph that dies on the GPU: a new worker on the CPU, the faces go, and frames go on', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    const first = s.w();
    first.say({ type: 'result', result: result(1), ts: 1 });
    graphDies(first);
    expect(W.all).toHaveLength(2);
    expect(first.ended).toBe(true);
    expect(s.alive()).toHaveLength(1);
    expect(s.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    expect(s.faces).toEqual([1, 0]); // no sticker stays at the old place of the face
    await tick(8);
    expect(s.t.health).toMatchObject({ delegate: 'CPU', restarts: 1, firstError: 'RET_CHECK failure in the face geometry' });
    expect(s.ready).toEqual(['GPU', 'CPU']);
    s.t.push(video, 100); await tick(2);
    expect(s.w().frames()).toHaveLength(1);
    s.t.stop();
  });

  it('a graph that dies again on the CPU: a new worker on the CPU again, after the wait', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    graphDies(s.w()); await tick(8);
    s.at(1000); graphDies(s.w()); // too soon after the first new start
    expect(W.all).toHaveLength(2);
    s.at(6000); s.w().say({ type: 'error', message: 'Graph has errors' });
    expect(W.all).toHaveLength(3);
    expect(s.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    expect(s.alive()).toHaveLength(1);
    s.t.stop();
  });

  it('a forced tracker starts again on the same one', async () => {
    const s = setup('GPU');
    s.t.start(); await tick(8);
    graphDies(s.w());
    expect(W.all).toHaveLength(2);
    expect(s.w().posted[0]).toMatchObject({ prefer: 'GPU' });
    s.t.stop();
  });

  it('a worker that dies is an error, and the CPU takes over', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    s.w().onerror?.({ message: 'Script error' });
    expect(s.errors[0]).toContain('Script error');
    expect(W.all).toHaveLength(2);
    expect(s.w().posted[0]).toMatchObject({ prefer: 'CPU' });
    s.t.stop();
  });

  it('the start limit counts from the moment the files are on the device: a slow download is no error', async () => {
    const s = setup('auto', 20);
    W.mode = 'no files';
    s.t.start();
    await tick(50);
    expect(s.errors).toEqual([]);
    expect(W.all).toHaveLength(1);
    expect(s.t.health).toMatchObject({ files: false, delegate: '' });
    s.w().say({ type: 'loaded' });
    await tick(40);
    expect(s.errors).toEqual(['no start in 0.02 s']);
    expect(W.all).toHaveLength(2);
    s.t.stop();
  });

  it('an error at the start ends the wait: the report keeps the true cause', async () => {
    const s = setup('CPU', 20);
    W.mode = 'silent';
    s.t.start(); await tick(5);
    s.w().say({ type: 'error', message: 'wasm did not load' }); // a new start follows
    await tick(5);
    expect(W.all).toHaveLength(2);
    s.w().say({ type: 'error', message: 'wasm did not load' }); // too soon for one more start: this worker stays
    await tick(40);
    expect(W.all).toHaveLength(2);
    expect(s.errors).toEqual(['wasm did not load', 'wasm did not load']);
    expect(s.t.health).toMatchObject({ firstError: 'wasm did not load', lastError: 'wasm did not load' });
    s.t.stop();
  });

  it('stop() ends the wait for the start', async () => {
    const s = setup('auto', 20);
    W.mode = 'silent';
    s.t.start(); await tick(5);
    s.t.stop();
    await tick(40);
    expect(W.all).toHaveLength(1);
    expect(s.errors).toEqual([]);
  });

  it('after stop() nothing starts again: a late error of the old worker counts for nothing', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    const old = s.w();
    s.t.stop();
    old.onerror?.({ message: 'late' });
    graphDies(old);
    old.say({ type: 'result', result: result(1), ts: 5 });
    expect(W.all).toHaveLength(1);
    expect(s.errors).toEqual([]);
    expect(s.faces).toEqual([]);
  });

  it('a frame with no answer does not block the tracker for ever, and a busy worker gets no pile of frames', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    s.t.push(video, 0); await tick(2);
    s.t.push(video, 1000); await tick(2);
    expect(s.w().frames()).toHaveLength(1); // the first one is still out
    s.t.push(video, 6000); await tick(2);
    expect(s.t.health.lastError).toContain('no answer');
    expect(s.w().frames()).toHaveLength(2); // one more try
    s.t.push(video, 12000); await tick(2);
    s.t.push(video, 18000); await tick(2);
    expect(s.w().frames()).toHaveLength(2); // two are out: no more
    s.w().say({ type: 'result', result: result(1), ts: 0 });
    s.w().say({ type: 'result', result: result(1), ts: 6000 });
    s.t.push(video, 18033); await tick(2);
    expect(s.w().frames()).toHaveLength(3);
    s.t.stop();
  });
});
