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
  private ready = false;
  private last: Face[] = [];
  private filters: OneEuroArray[];
  private present: boolean[];
  private misses = 0;
  private stills = new Map<number, (lm: Float32Array | null) => void>();
  private stillId = 0;

  constructor(private opts: Opts) {
    this.filters = Array.from({ length: opts.numFaces }, () => new OneEuroArray(LM));
    this.present = new Array(opts.numFaces).fill(false);
  }

  start(): void {
    this.worker = new Worker(new URL('./face.worker.ts', import.meta.url));
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'ready') { this.ready = true; this.opts.onReady?.(m.delegate); }
      else if (m.type === 'error') { this.inFlight = false; this.opts.onError?.(m.message); }
      else if (m.type === 'result') { this.inFlight = false; this.opts.onFaces(this.smooth(m.result, m.ts)); }
      else if (m.type === 'still') { this.stills.get(m.id)?.(m.landmarks); this.stills.delete(m.id); }
    };
    const msg: WorkerIn = { type: 'init', wasmPath: `/mediapipe/${__MP_VER__}/wasm`, modelPath: '/models/face_landmarker-f16-v1.task', numFaces: this.opts.numFaces };
    this.worker.postMessage(msg);
  }

  push(video: HTMLVideoElement, tMs: number): void {
    if (!this.worker || !this.ready || this.inFlight || video.readyState < 2) return;
    this.inFlight = true;
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
