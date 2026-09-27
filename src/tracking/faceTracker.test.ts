import { describe, it, expect } from 'vitest';
import { FaceTracker } from './faceTracker';
import type { FaceResult } from './types';

// A face with a size in a slot of the result: its first point is at `fill`, the others lie around it
function put(landmarks: Float32Array, slot: number, fill: number) {
  for (let i = 0; i < 478; i++) { const o = (slot * 478 + i) * 3; landmarks[o] = fill + 0.1 * (i % 2); landmarks[o + 1] = fill + 0.1 * ((i >> 1) % 2); landmarks[o + 2] = fill; }
}
function result(count: number, fill = 0.5): FaceResult {
  const landmarks = new Float32Array(2 * 478 * 3);
  put(landmarks, 0, fill); put(landmarks, 1, fill);
  return { landmarks, count, blend: new Float32Array(count * 52), width: 640, height: 480 };
}
// Faces with no size: every point at one place
const flat = (count: number, fill = 0.5): FaceResult => ({ ...result(count), landmarks: new Float32Array(2 * 478 * 3).fill(fill) });

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
    put(r.landmarks, 1, 0.9);
    const faces = t.smooth(r, 66);
    expect(faces[1].landmarks[0]).toBeCloseTo(0.9, 4);
    expect(faces[0].landmarks[0]).toBeCloseTo(0.3, 4);
  });
});

describe('FaceTracker and faces that are no faces', () => {
  // two faces in one result: the first one with a size, the second one with all points at one place
  function mixed(): FaceResult {
    const r = result(2);
    for (let i = 0; i < 478; i++) { r.landmarks[i * 3] = 0.4 + 0.1 * Math.cos(i); r.landmarks[i * 3 + 1] = 0.5 + 0.1 * Math.sin(i); }
    r.landmarks.fill(0.5, 478 * 3); // the second one: no size
    r.blend[0] = 0.25; r.blend[52] = 0.75;
    return r;
  }
  it('leaves out a face with no size, and keeps the other one', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    const faces = t.smooth(mixed(), 0);
    expect(faces).toHaveLength(1);
    expect(faces[0].landmarks[0]).toBeCloseTo(0.5);
    expect(faces[0].blend[0]).toBeCloseTo(0.25);
  });
  it('keeps the blend values of the face that stays, when the face before it goes', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    const r = mixed();
    const lm = r.landmarks.slice(0, 478 * 3);
    r.landmarks.copyWithin(478 * 3, 0, 478 * 3); // the good face is the second one now
    r.landmarks.fill(0.5, 0, 478 * 3); // the first one has no size
    const faces = t.smooth(r, 0);
    expect(faces).toHaveLength(1);
    expect(Array.from(faces[0].landmarks.slice(0, 6))).toEqual(Array.from(lm.slice(0, 6)));
    expect(faces[0].blend[0]).toBeCloseTo(0.75);
  });
  it('a face that moves into the place of a face that was left out starts fresh: no mix of two faces', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    const both = result(2, 0.2);
    put(both.landmarks, 1, 0.7); // the first face at 0.2, the second one at 0.7
    t.smooth(both, 0);
    const one = result(2, 0.2);
    put(one.landmarks, 1, 0.7);
    one.landmarks.fill(0.2, 0, 478 * 3); // the first face has no size now
    const faces = t.smooth(one, 33);
    expect(faces).toHaveLength(1);
    expect(faces[0].landmarks[0]).toBeCloseTo(0.7, 4); // not on the way from 0.2 to 0.7
    const back = t.smooth(both, 66); // the first face is back: the two places have their own faces again
    expect(back[0].landmarks[0]).toBeCloseTo(0.2, 4);
    expect(back[1].landmarks[0]).toBeCloseTo(0.7, 4);
  });
  it('a result with no face of size counts as no face', () => {
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.smooth(mixed(), 0);
    let faces = t.smooth(flat(2), 33);
    expect(faces).toHaveLength(1); // a short gap: the last face holds
    for (let i = 0; i < 10; i++) faces = t.smooth(flat(2), 66 + i * 33);
    expect(faces).toEqual([]);
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
    static readyAfterMs = 5; // -1: the worker never says ready
    posted: Msg[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor() { StillWorker.last = this; }
    postMessage(m: Msg) {
      this.posted.push(m);
      if (m.type === 'init' && StillWorker.readyAfterMs >= 0) setTimeout(() => this.onmessage?.({ data: { type: 'ready', delegate: 'CPU' } }), StillWorker.readyAfterMs);
    }
    answer(id: number, landmarks: Float32Array | null) { this.onmessage?.({ data: { type: 'still', id, landmarks } }); }
    terminate() {}
  }
  const picture = () => { const b = { closed: false, close() { b.closed = true; } }; return b as unknown as ImageBitmap & { closed: boolean }; };
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started = async () => {
    (globalThis as any).Worker = StillWorker;
    StillWorker.readyAfterMs = 5;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {} });
    t.start();
    await tick(15);
    return { t, w: StillWorker.last };
  };

  it('waits for a tracker that starts, and sends the picture then', async () => {
    (globalThis as any).Worker = StillWorker;
    StillWorker.readyAfterMs = 40;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {}, stillStepMs: 10 });
    t.start();
    const p = picture(), a = t.detectStill(p);
    await tick(20);
    expect(StillWorker.last.posted.filter((m) => m.type === 'still')).toHaveLength(0); // not ready yet
    await tick(60);
    const sent = StillWorker.last.posted.filter((m) => m.type === 'still');
    expect(sent).toHaveLength(1);
    const found = new Float32Array(478 * 3);
    put(found, 0, 0.2);
    StillWorker.last.answer(sent[0].id!, found);
    expect(await a).toBe(found);
    t.stop();
  });

  it('gives null and closes the picture when the tracker does not get ready in time', async () => {
    (globalThis as any).Worker = StillWorker;
    StillWorker.readyAfterMs = -1;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {}, stillStepMs: 10, stillWaitMs: 50 });
    t.start();
    const p = picture();
    expect(await t.detectStill(p)).toBeNull();
    expect(p.closed).toBe(true);
    expect(StillWorker.last.posted.filter((m) => m.type === 'still')).toHaveLength(0);
    t.stop();
  });

  it('a tracker that stops ends the wait of a picture', async () => {
    (globalThis as any).Worker = StillWorker;
    StillWorker.readyAfterMs = -1;
    const t = new FaceTracker({ numFaces: 2, onFaces: () => {}, stillStepMs: 10, stillWaitMs: 5000 });
    t.start();
    const p = picture(), a = t.detectStill(p);
    t.stop();
    const first = await Promise.race([a, tick(200).then(() => 'still waits')]);
    expect(first).toBeNull();
    expect(p.closed).toBe(true);
  });

  it('gives null and closes the picture when the tracker does not run', async () => {
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
    const found = new Float32Array(478 * 3);
    put(found, 0, 0.2);
    w.answer(sent[1].id!, found); // answers in the other order
    w.answer(sent[0].id!, null);
    expect(await b).toBe(found);
    expect(await a).toBeNull();
    t.stop();
  });

  it('a face with no size in a still picture is no face', async () => {
    const { t, w } = await started();
    const a = t.detectStill(picture());
    w.answer(w.posted.find((m) => m.type === 'still')!.id!, new Float32Array(478 * 3).fill(0.2));
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
  function setup(prefer?: 'auto' | 'GPU' | 'CPU', startLimitMs?: number, first?: 'auto' | 'GPU' | 'CPU') {
    W.all = []; W.mode = 'ok';
    (globalThis as any).Worker = W;
    (globalThis as any).createImageBitmap = async () => ({ close() {} });
    const errors: string[] = [], ready: string[] = [], faces: number[] = [];
    let now = 0;
    const fell: number[] = [];
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => faces.push(f.length), onError: (m) => errors.push(m), onReady: (d) => ready.push(d), prefer, startLimitMs, now: () => now, first, onFall: () => fell.push(1) });
    return { t, errors, ready, faces, fell, w: () => W.all.at(-1)!, alive: () => W.all.filter((w) => !w.ended), at: (ms: number) => { now = ms; } };
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

  it('says so when it leaves the GPU, so the app can keep that for the next start', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    graphDies(s.w());
    expect(s.fell).toHaveLength(1);
    await tick(8); s.at(6000);
    graphDies(s.w()); // a new start on the CPU again: nothing new to keep
    expect(s.fell).toHaveLength(1);
    s.t.stop();
  });

  it('starts on the CPU at once when the app says so, and the report still says that nobody forced it', async () => {
    const s = setup('auto', undefined, 'CPU');
    s.t.start();
    expect(s.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' });
    await tick(8);
    expect(s.t.health).toMatchObject({ prefer: 'auto', delegate: 'CPU', note: 'the GPU failed on this browser before' });
    graphDies(s.w());
    expect(s.w().posted[0]).toMatchObject({ prefer: 'CPU' }); // a new start stays on the CPU
    expect(s.fell).toEqual([]);
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

  it('a start that fails too soon after the last start gets its new start when the wait is over', async () => {
    const s = setup();
    W.mode = 'no files'; // the network is down: the model does not come
    s.t.start();
    s.w().say({ type: 'error', message: 'Failed to fetch' }); // a new start follows at once
    expect(W.all).toHaveLength(2);
    s.at(4970);
    s.w().say({ type: 'error', message: 'Failed to fetch' }); // too soon: 30 ms of the wait are left
    expect(W.all).toHaveLength(2);
    W.mode = 'ok'; // the network is back
    await tick(80);
    expect(W.all).toHaveLength(3);
    expect(s.alive()).toHaveLength(1);
    expect(s.t.health).toMatchObject({ restarts: 2, errors: 2, delegate: 'CPU' });
    s.t.push(video, 5000); await tick(2);
    expect(s.w().frames()).toHaveLength(1);
    s.t.stop();
  });

  it('a worker that dies too soon after the last start gets no more frames, and a new worker when the wait is over', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    graphDies(s.w()); await tick(8); // a new start on the CPU, at time 0
    expect(W.all).toHaveLength(2);
    s.at(4970);
    s.w().onerror?.({ message: 'out of memory' });
    s.t.push(video, 4980); await tick(2);
    expect(s.w().frames()).toHaveLength(0);
    await tick(80);
    expect(W.all).toHaveLength(3);
    expect(s.alive()).toHaveLength(1);
    s.t.stop();
  });

  it('the later start comes also when the numbers of the clock do not round well', async () => {
    const s = setup();
    W.mode = 'no files';
    s.at(4227.8);
    s.t.start();
    s.w().say({ type: 'error', message: 'Failed to fetch' }); // a new start at 4227.8
    expect(W.all).toHaveLength(2);
    s.at(9197.5); // 30.3 ms of the wait are left. In a computer 9197.5 + 30.3 - 4227.8 is a little less than 5000
    s.w().say({ type: 'error', message: 'Failed to fetch' });
    await tick(80);
    expect(W.all).toHaveLength(3);
    s.t.stop();
  });

  it('a start on the CPU that fails says nothing about the GPU: the app keeps nothing', async () => {
    const s = setup('auto', undefined, 'CPU'); // the app started on the CPU, by what it kept
    W.mode = 'silent';
    s.t.start(); await tick(5); // the files are on the device, the tracker is not ready
    expect(s.t.health.files).toBe(true);
    s.w().say({ type: 'error', message: 'wasm: out of memory' });
    expect(W.all).toHaveLength(2);
    expect(s.fell).toEqual([]);
    s.t.stop();
  });

  it('no start is left and the worker says an error that it survives: the frames go on', async () => {
    const s = setup('CPU');
    s.t.start(); await tick(8);
    for (let i = 0; i < 6; i++) { s.at(i * 5000); s.w().onerror?.({ message: 'x' }); await tick(8); }
    expect(W.all).toHaveLength(7); // the first one and six new starts
    s.at(40000);
    s.w().onerror?.({ message: 'an error that the worker survives' });
    s.t.push(video, 40000); await tick(2);
    expect(W.all).toHaveLength(7);
    expect(s.w().frames()).toHaveLength(1);
    s.t.stop();
  });

  it('no start is left: the tracker rests, with no timer that runs', async () => {
    const s = setup('CPU');
    W.mode = 'no files';
    s.t.start();
    for (let i = 0; i < 7; i++) { s.at(i * 5000); s.w().say({ type: 'error', message: 'Failed to fetch' }); }
    expect(W.all).toHaveLength(7); // the first one and six new starts
    await tick(40);
    expect(W.all).toHaveLength(7);
    s.t.stop();
  });

  it('stop() ends the wait for the later start too', async () => {
    const s = setup();
    W.mode = 'no files';
    s.t.start();
    s.w().say({ type: 'error', message: 'Failed to fetch' });
    s.at(4970);
    s.w().say({ type: 'error', message: 'Failed to fetch' });
    s.t.stop();
    await tick(80);
    expect(W.all).toHaveLength(2);
  });

  it('a download that fails is not a failure of the GPU: the app keeps nothing for the next start', async () => {
    const s = setup();
    W.mode = 'no files';
    s.t.start();
    s.w().say({ type: 'error', message: 'Failed to fetch' }); // before the files were on the device
    expect(W.all).toHaveLength(2);
    expect(s.fell).toEqual([]);
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
    s.t.push(video, 8000); await tick(2);
    s.t.push(video, 10000); await tick(2);
    expect(s.w().frames()).toHaveLength(2); // two are out: no more
    s.w().say({ type: 'result', result: result(1), ts: 0 });
    s.w().say({ type: 'result', result: result(1), ts: 6000 });
    s.t.push(video, 10033); await tick(2);
    expect(s.w().frames()).toHaveLength(3);
    expect(W.all).toHaveLength(1); // a slow worker is no dead worker
    s.t.stop();
  });

  it('a worker that hangs gets a new worker: the second frame has no answer too', async () => {
    const s = setup();
    s.t.start(); await tick(8);
    const first = s.w();
    first.say({ type: 'result', result: result(1), ts: 0 });
    s.t.push(video, 0); await tick(2);
    s.at(6000); s.t.push(video, 6000); await tick(2);
    expect(first.frames()).toHaveLength(2);
    expect(s.alive()).toEqual([first]);
    s.at(11000); s.t.push(video, 11000); await tick(8);
    expect(first.ended).toBe(true);
    expect(s.alive()).toHaveLength(1);
    expect(s.w().posted[0]).toMatchObject({ type: 'init', prefer: 'CPU' }); // as after a worker that died
    expect(s.t.health.restarts).toBe(1);
    expect(s.t.health.lastError).toContain('no answer');
    expect(s.faces.at(-1)).toBe(0); // the faces go
    s.t.push(video, 11033); await tick(2);
    expect(s.w().frames()).toHaveLength(1); // the new worker works
    s.t.stop();
  });

  it('a worker that is slow at its first frame is no worker that hangs: the model starts with the first frame', async () => {
    const s = setup(undefined, 20000);
    s.t.start(); await tick(8);
    s.t.push(video, 0); await tick(2);
    s.at(6000); s.t.push(video, 6000); await tick(2);
    expect(s.w().frames()).toHaveLength(2);
    s.at(11000); s.t.push(video, 11000); await tick(8);
    s.at(13000); s.t.push(video, 13000); await tick(8);
    expect(W.all).toHaveLength(1); // no new worker
    expect(s.t.health.restarts).toBe(0);
    expect(s.fell).toEqual([]); // and no mark of a failed GPU
    s.w().say({ type: 'result', result: result(1), ts: 0 });
    s.w().say({ type: 'result', result: result(1), ts: 6000 });
    s.t.push(video, 13033); await tick(2);
    expect(s.w().frames()).toHaveLength(3); // the frames go on
    s.t.stop();
  });

  it('a worker that gives no answer to its first frames in the time of a start gets a new worker', async () => {
    const s = setup(undefined, 20000);
    s.t.start(); await tick(8);
    const first = s.w();
    s.t.push(video, 0); await tick(2);
    s.at(6000); s.t.push(video, 6000); await tick(2);
    s.at(25000); s.t.push(video, 25000); await tick(8);
    expect(s.alive()).toEqual([first]);
    s.at(26100); s.t.push(video, 26100); await tick(8);
    expect(first.ended).toBe(true);
    expect(s.alive()).toHaveLength(1);
    expect(s.t.health.restarts).toBe(1);
    s.t.stop();
  });

  it('no start is left and the worker hangs: one error for every wait, not one for every frame', async () => {
    const s = setup('CPU');
    s.t.start(); await tick(8);
    for (let i = 0; i < 6; i++) { s.at(i * 5000); s.w().onerror?.({ message: 'x' }); await tick(8); }
    expect(W.all).toHaveLength(7); // the first one and six new starts
    s.w().say({ type: 'result', result: result(1), ts: 0 }); // the worker ran, then it hangs
    s.at(40000); s.t.push(video, 40000); await tick(2);
    s.at(46000); s.t.push(video, 46000); await tick(2);
    const errors = s.t.health.errors;
    s.at(52000); s.t.push(video, 52000); s.t.push(video, 52033); s.t.push(video, 52066); await tick(2);
    expect(s.t.health.errors).toBe(errors + 1);
    s.at(57100); s.t.push(video, 57100); s.t.push(video, 57133); await tick(2);
    expect(s.t.health.errors).toBe(errors + 2);
    expect(W.all).toHaveLength(7);
    expect(s.w().frames()).toHaveLength(2); // no pile of frames
    s.t.stop();
  });
});
