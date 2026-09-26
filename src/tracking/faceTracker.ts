import { OneEuroArray } from './oneEuro';
import type { WorkerIn, WorkerOut, FaceResult } from './types';

export type Face = { landmarks: Float32Array; matrix: Float32Array; blend: Float32Array };

type Opts = {
  numFaces: number;
  onFaces: (faces: Face[]) => void;
  onReady?: (delegate: 'GPU' | 'CPU') => void;
  onError?: (msg: string) => void;
};

const LM = 478 * 3;
const MISS_LIMIT = 10;

export class FaceTracker {
  private worker: Worker | null = null;
  private inFlight = false;
  private filters: OneEuroArray[];
  private present: boolean[];
  private misses = 0;

  constructor(private opts: Opts) {
    this.filters = Array.from({ length: opts.numFaces }, () => new OneEuroArray(LM));
    this.present = new Array(opts.numFaces).fill(false);
  }

  start(): void {
    this.worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'ready') this.opts.onReady?.(m.delegate);
      else if (m.type === 'error') { this.inFlight = false; this.opts.onError?.(m.message); }
      else if (m.type === 'result') { this.inFlight = false; this.opts.onFaces(this.smooth(m.result, m.ts)); }
    };
    const msg: WorkerIn = { type: 'init', wasmPath: '/mediapipe/wasm', modelPath: '/models/face_landmarker.task', numFaces: this.opts.numFaces };
    this.worker.postMessage(msg);
  }

  push(video: HTMLVideoElement, tMs: number): void {
    if (!this.worker || this.inFlight || video.readyState < 2) return;
    this.inFlight = true;
    createImageBitmap(video).then((bitmap) => {
      const msg: WorkerIn = { type: 'frame', bitmap, ts: tMs };
      this.worker?.postMessage(msg, [bitmap]);
    }).catch(() => { this.inFlight = false; });
  }

  stop(): void { this.worker?.terminate(); this.worker = null; this.inFlight = false; }

  smooth(r: FaceResult, tMs: number): Face[] {
    if (r.count === 0) {
      this.misses++;
      if (this.misses >= MISS_LIMIT) { this.filters.forEach((f) => f.reset()); this.present.fill(false); return []; }
      return [];
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
    return out;
  }
}
