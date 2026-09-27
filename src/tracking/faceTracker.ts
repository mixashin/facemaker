import { OneEuroArray } from './oneEuro';
import type { WorkerIn, WorkerOut, FaceResult } from './types';
import { Health, START_LIMIT_MS, type Prefer } from './health';

export type Face = { landmarks: Float32Array; matrix: Float32Array; blend: Float32Array };

type Opts = {
  numFaces: number;
  onFaces: (faces: Face[]) => void;
  onReady?: (delegate: 'GPU' | 'CPU') => void;
  onError?: (msg: string) => void;
  prefer?: Prefer; // auto: the GPU first. A forced tracker stays, whatever happens
  startLimitMs?: number;
};

const LM = 478 * 3;
const MISS_LIMIT = 10;
const STALL_MS = 5000; // a frame with no answer for this long: the tracker takes the next frame

export class FaceTracker {
  private worker: Worker | null = null;
  private inFlight = false;
  private ready = false;
  private last: Face[] = [];
  private filters: OneEuroArray[];
  private present: boolean[];
  private misses = 0;
  private stills = new Map<number, (lm: Float32Array | null) => void>();
  private stillId = 0;
  private sentAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly health: Health;

  constructor(private opts: Opts) {
    this.filters = Array.from({ length: opts.numFaces }, () => new OneEuroArray(LM));
    this.present = new Array(opts.numFaces).fill(false);
    this.health = new Health(opts.prefer ?? 'auto');
  }

  // An error, for the report and for the screen. again: the health asks for a new start on the CPU.
  private fail(message: string, again: boolean): void {
    this.opts.onError?.(message);
    if (again) { this.stop(); this.start('CPU'); }
  }

  start(prefer: Prefer = this.health.prefer): void {
    this.worker = new Worker(new URL('./face.worker.ts', import.meta.url));
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'ready') { clearTimeout(this.timer); this.ready = true; this.health.ready(m.delegate, m.note); this.opts.onReady?.(m.delegate); }
      else if (m.type === 'error') { this.inFlight = false; this.fail(m.message, this.ready ? this.health.error(m.message) : this.health.failed(m.message)); }
      else if (m.type === 'result') { this.inFlight = false; this.health.result(m.result.count); this.opts.onFaces(this.smooth(m.result, m.ts)); }
      else if (m.type === 'still') { this.stills.get(m.id)?.(m.landmarks); this.stills.delete(m.id); }
    };
    this.worker.onerror = (e) => { const text = 'worker: ' + (e.message || 'did not load'); this.fail(text, this.health.failed(text)); };
    const limit = this.opts.startLimitMs ?? START_LIMIT_MS;
    this.timer = setTimeout(() => { if (!this.ready) { const text = `no start in ${limit / 1000} s`; this.fail(text, this.health.failed(text)); } }, limit);
    const msg: WorkerIn = { type: 'init', wasmPath: `/mediapipe/${__MP_VER__}/wasm`, modelPath: '/models/face_landmarker-f16-v1.task', numFaces: this.opts.numFaces, prefer };
    this.worker.postMessage(msg);
  }

  push(video: HTMLVideoElement, tMs: number): void {
    if (!this.worker || !this.ready || video.readyState < 2) return;
    if (this.inFlight) {
      if (tMs - this.sentAt < STALL_MS) return;
      this.inFlight = false; // the worker lost a frame or hangs
      const text = `no answer to a frame in ${STALL_MS / 1000} s`;
      this.fail(text, this.health.error(text));
      return;
    }
    this.inFlight = true;
    this.sentAt = tMs;
    createImageBitmap(video).then((bitmap) => {
      const msg: WorkerIn = { type: 'frame', bitmap, ts: tMs };
      this.worker?.postMessage(msg, [bitmap]);
    }).catch(() => { this.inFlight = false; });
  }

  // One picture, not a video frame: the device photo of face-on mode. The picture is handed over and closed.
  // Result: the landmarks of the first face, or null (no face, worker not ready, tracker stopped).
  detectStill(bitmap: ImageBitmap): Promise<Float32Array | null> {
    if (!this.worker || !this.ready) { bitmap.close(); return Promise.resolve(null); }
    const id = ++this.stillId;
    return new Promise((resolve) => {
      this.stills.set(id, resolve);
      const msg: WorkerIn = { type: 'still', bitmap, id };
      this.worker!.postMessage(msg, [bitmap]);
    });
  }

  stop(): void {
    clearTimeout(this.timer);
    this.worker?.terminate(); this.worker = null; this.inFlight = false; this.ready = false;
    this.stills.forEach((resolve) => resolve(null));
    this.stills.clear();
  }

  smooth(r: FaceResult, tMs: number): Face[] {
    if (r.count === 0) {
      this.misses++;
      if (this.misses >= MISS_LIMIT) { this.filters.forEach((f) => f.reset()); this.present.fill(false); this.last = []; return []; }
      return this.last; // hold the last faces through short dropouts
    }
    this.misses = 0;
    const out: Face[] = [];
    for (let f = 0; f < this.opts.numFaces; f++) {
      if (f >= r.count) { if (this.present[f]) { this.filters[f].reset(); this.present[f] = false; } continue; }
      if (!this.present[f]) { this.filters[f].reset(); this.present[f] = true; }
      const src = r.landmarks.subarray(f * LM, (f + 1) * LM);
      const dst = new Float32Array(LM);
      this.filters[f].filter(src, dst, tMs);
      out.push({ landmarks: dst, matrix: r.matrices.slice(f * 16, f * 16 + 16), blend: r.blend.slice(f * 52, f * 52 + 52) });
    }
    this.last = out;
    return out;
  }
}
