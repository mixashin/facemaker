import { OneEuroArray } from './oneEuro';
import type { WorkerIn, WorkerOut, FaceResult } from './types';
import { Health, START_LIMIT_MS, type Action, type Prefer } from './health';
import { usable } from './faces';

export type Face = { landmarks: Float32Array; blend: Float32Array };

type Opts = {
  numFaces: number;
  onFaces: (faces: Face[]) => void;
  onReady?: (delegate: 'GPU' | 'CPU') => void;
  onError?: (msg: string) => void;
  prefer?: Prefer; // auto: the GPU first. A forced tracker stays, whatever happens
  startLimitMs?: number;
  now?: () => number;
  first?: Prefer; // the tracker of the first start, when it is not `prefer` (src/tracking/health.ts, firstStart)
  onFall?: () => void; // the tracker left the GPU by itself
  stillWaitMs?: number; // how long a still picture waits for a tracker that starts
  stillStepMs?: number;
};

const LM = 478 * 3;
const MISS_LIMIT = 10;
const STILL_WAIT_MS = 8000; // a new start after an error takes 5 s of wait and the start itself
const STALL_MS = 5000; // a frame with no answer for this long: one more frame. No answer to that one too: the worker hangs

export class FaceTracker {
  private worker: Worker | null = null;
  private open = 0; // frames that are out and have no answer yet
  private asked: Prefer = 'auto'; // the tracker of the worker that runs
  private ready = false;
  private last: Face[] = [];
  private filters: OneEuroArray[];
  private present: boolean[];
  private source: number[]; // the place in the list of the tracker, of the face in every place of the app
  private misses = 0;
  private stills = new Map<number, (lm: Float32Array | null) => void>();
  private stillId = 0;
  private sentAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly health: Health;

  constructor(private opts: Opts) {
    this.filters = Array.from({ length: opts.numFaces }, () => new OneEuroArray(LM));
    this.present = new Array(opts.numFaces).fill(false);
    this.source = new Array(opts.numFaces).fill(-1);
    this.health = new Health(opts.prefer ?? 'auto');
  }

  private now(): number { return this.opts.now?.() ?? performance.now(); }

  // An error, for the report and the console. what: the answer of the health. A new start takes a new worker:
  // a graph of MediaPipe that had an error stays broken. The faces go, so no effect stays at an old place.
  private fail(message: string, what: Action): void {
    this.opts.onError?.(message);
    if (what === 'none') this.later(); else this.renew(what);
  }

  private renew(what: 'cpu' | 'again'): void {
    this.stop();
    this.filters.forEach((f) => f.reset()); this.present.fill(false); this.last = []; this.misses = 0;
    this.opts.onFaces([]);
    // Only a tracker that had its files and ran on the GPU can say something about the GPU: a download that
    // failed says nothing, and a start on the CPU that failed says nothing
    if (what === 'cpu' && this.health.files && this.asked !== 'CPU') this.opts.onFall?.();
    this.start(what === 'cpu' ? 'CPU' : this.asked);
  }

  // The worker failed and the new start has to wait (two starts are 5 s apart). A tracker that is not ready
  // gets no frame, so no error comes that starts it again: it starts by itself when the wait is over.
  private later(): void {
    const w = this.worker, now = this.now(), wait = this.ready ? null : this.health.wait(now);
    if (!w || wait === null) return;
    clearTimeout(this.timer);
    // One millisecond more than the wait: a timer can come a little too soon, and the sum of the times can be
    // a little less than the wait by rounding. Then the health would say "not now" and nothing would follow.
    const due = now + wait + 1;
    this.timer = setTimeout(() => {
      if (this.worker !== w || this.ready) return;
      const what = this.health.retry(Math.max(this.now(), due));
      if (what === 'none') this.later(); else this.renew(what); // none: no start is left, and later() ends there
    }, wait + 1);
  }

  start(prefer: Prefer = this.opts.first ?? this.health.prefer): void {
    const w = (this.worker = new Worker(new URL('./face.worker.ts', import.meta.url)));
    this.asked = prefer;
    const limit = this.opts.startLimitMs ?? START_LIMIT_MS;
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (this.worker !== w) return; // a worker that was ended can still have a message on its way
      const m = e.data;
      if (m.type === 'loaded') {
        this.health.loaded();
        this.timer = setTimeout(() => { if (this.worker === w && !this.ready) { const text = `no start in ${limit / 1000} s`; this.fail(text, this.health.failed(text, this.now())); } }, limit);
      } else if (m.type === 'ready') { clearTimeout(this.timer); this.ready = true; this.health.ready(m.delegate, m.note ?? (this.health.prefer === 'auto' && this.opts.first === 'CPU' ? 'the GPU failed on this browser before' : '')); this.opts.onReady?.(m.delegate); }
      else if (m.type === 'error') {
        this.open = Math.max(0, this.open - 1);
        if (!this.ready) clearTimeout(this.timer); // the error is the cause, the limit would write over it
        this.fail(m.message, this.ready ? this.health.error(m.message, this.now()) : this.health.failed(m.message, this.now()));
      } else if (m.type === 'result') { this.open = Math.max(0, this.open - 1); this.health.result(this.sized(m.result).length); this.opts.onFaces(this.smooth(m.result, m.ts)); }
      else if (m.type === 'still') { this.stills.get(m.id)?.(usable(m.landmarks) ? m.landmarks : null); this.stills.delete(m.id); }
    };
    w.onerror = (e) => {
      if (this.worker !== w) return;
      clearTimeout(this.timer);
      // No frame goes to a worker that died. With no start left the worker stays: it can be alive after an
      // error, and then the frames go on.
      if (this.health.wait(this.now()) !== null) this.ready = false;
      const text = 'worker: ' + (e.message || 'did not load');
      this.fail(text, this.health.failed(text, this.now()));
    };
    const msg: WorkerIn = { type: 'init', wasmPath: `/mediapipe/${__MP_VER__}/wasm`, modelPath: '/models/face_landmarker-f16-v1.task', numFaces: this.opts.numFaces, prefer };
    this.worker.postMessage(msg);
  }

  push(video: HTMLVideoElement, tMs: number): void {
    if (!this.worker || !this.ready || video.readyState < 2) return;
    if (this.open > 0) {
      // One frame at a time. A frame with no answer for a long time: one more try, never a pile of frames.
      if (tMs - this.sentAt < STALL_MS) return;
      const text = `no answer to a frame in ${STALL_MS / 1000} s`, w = this.worker;
      if (this.open > 1) {
        // The second frame has no answer too: the worker hangs. It is handled as a worker that died: no more
        // frames, and a new worker. With no start left the worker stays, with one error for every wait.
        this.sentAt = tMs;
        if (this.health.wait(this.now()) !== null) this.ready = false;
        this.fail(text, this.health.failed(text, this.now()));
        return;
      }
      this.fail(text, this.health.error(text, this.now()));
      if (this.worker !== w || !this.ready) return; // a new start is on its way
    }
    this.open++;
    this.sentAt = tMs;
    const to = this.worker;
    createImageBitmap(video).then((bitmap) => {
      const msg: WorkerIn = { type: 'frame', bitmap, ts: tMs };
      if (this.worker === to) to.postMessage(msg, [bitmap]); else bitmap.close(); // the worker changed while the picture was made
    }).catch(() => { if (this.worker === to) this.open = Math.max(0, this.open - 1); });
  }

  // One picture, not a video frame: the device photo of face-on mode. The picture is handed over and closed.
  // Result: the landmarks of the first face, or null (no face, tracker stopped, tracker not ready in time).
  // A tracker that starts (the first start, a new start after errors) is not ready for some seconds: the
  // picture waits for it. Without the wait the answer was "no face" for a photo with a face.
  async detectStill(bitmap: ImageBitmap): Promise<Float32Array | null> {
    const step = this.opts.stillStepMs ?? 100, tries = (this.opts.stillWaitMs ?? STILL_WAIT_MS) / step;
    for (let i = 0; this.worker && !this.ready && i < tries; i++) await new Promise((r) => setTimeout(r, step));
    if (!this.worker || !this.ready) { bitmap.close(); return null; }
    const id = ++this.stillId;
    return new Promise((resolve) => {
      this.stills.set(id, resolve);
      const msg: WorkerIn = { type: 'still', bitmap, id };
      this.worker!.postMessage(msg, [bitmap]);
    });
  }

  stop(): void {
    clearTimeout(this.timer);
    this.worker?.terminate(); this.worker = null; this.open = 0; this.ready = false;
    this.stills.forEach((resolve) => resolve(null));
    this.stills.clear();
  }

  // The places of the faces with a size in a result (src/tracking/faces.ts), in the order of the tracker
  private sized(r: FaceResult): number[] {
    const which: number[] = [];
    for (let f = 0; f < r.count && which.length < this.opts.numFaces; f++) if (usable(r.landmarks.subarray(f * LM, (f + 1) * LM))) which.push(f);
    return which;
  }

  smooth(r: FaceResult, tMs: number): Face[] {
    const which = this.sized(r);
    if (which.length === 0) {
      this.misses++;
      if (this.misses >= MISS_LIMIT) { this.filters.forEach((f) => f.reset()); this.present.fill(false); this.last = []; return []; }
      return this.last; // hold the last faces through short dropouts
    }
    this.misses = 0;
    const out: Face[] = [];
    for (let f = 0; f < this.opts.numFaces; f++) {
      if (f >= which.length) { if (this.present[f]) { this.filters[f].reset(); this.present[f] = false; } continue; }
      const from = which[f], src = r.landmarks.subarray(from * LM, (from + 1) * LM);
      // A face before this one was left out, or it is back: another face comes to this place. It starts fresh,
      // the filter must not lead it from the place of the other face to its own.
      if (!this.present[f] || this.source[f] !== from) { this.filters[f].reset(); this.present[f] = true; }
      this.source[f] = from;
      const dst = new Float32Array(LM);
      this.filters[f].filter(src, dst, tMs);
      out.push({ landmarks: dst, blend: r.blend.slice(from * 52, from * 52 + 52) });
    }
    this.last = out;
    return out;
  }
}
