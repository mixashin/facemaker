import { MaskSmoother, inputSize } from '../filters/mask';
import type { SegIn, SegOut } from './types';

type Opts = {
  onMask: (mask: Uint8Array, width: number, height: number) => void;
  onError?: (msg: string) => void;
};

const MAX_ERRORS = 30; // in a row. A segmenter that fails on every frame must not cost a bitmap and a log line per frame

// The selfie segmenter in its own worker (M4c). It runs only while a background scene is on.
export class SegTracker {
  private worker: Worker | null = null;
  private inFlight = false;
  private ready = false;
  private errors = 0;
  private gaveUp = false;
  private smoother = new MaskSmoother();

  constructor(private opts: Opts) {}

  get running(): boolean { return !!this.worker; }

  // Does nothing while a worker runs, and after the tracker gave up (see fail). stop() makes it willing again.
  start(): void {
    if (this.worker || this.gaveUp) return;
    const w = new Worker(new URL('./seg.worker.ts', import.meta.url));
    this.worker = w;
    w.onmessage = (e: MessageEvent<SegOut>) => {
      if (this.worker !== w) return; // an answer of a worker that was stopped
      const m = e.data;
      if (m.type === 'ready') this.ready = true;
      else if (m.type === 'error') this.fail(m.message);
      else if (m.type === 'mask') { this.inFlight = false; this.errors = 0; this.opts.onMask(this.smoother.push(m.mask, m.width, m.height), m.width, m.height); }
    };
    // A worker that cannot load its script, or dies, sends no message
    w.onerror = (e: ErrorEvent) => { if (this.worker === w) this.fail(e.message || 'worker error'); };
    const msg: SegIn = { type: 'init', wasmPath: `/mediapipe/${__MP_VER__}/wasm`, modelPath: '/models/selfie_segmenter-f16.tflite' };
    w.postMessage(msg);
  }

  private fail(message: string): void {
    this.inFlight = false;
    if (++this.errors < MAX_ERRORS) { this.opts.onError?.(message); return; }
    this.end();
    this.gaveUp = true; // until the scene goes off and on again
    this.opts.onError?.(`stopped after ${MAX_ERRORS} errors, the last one: ${message}`);
  }

  // A small copy of the frame goes to the worker: the model works at 256 px, and the mask comes back at the size of its input.
  push(video: HTMLVideoElement, tMs: number): void {
    const w = this.worker;
    if (!w || !this.ready || this.inFlight || video.readyState < 2) return;
    this.inFlight = true;
    const [resizeWidth, resizeHeight] = inputSize(video.videoWidth, video.videoHeight);
    createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: 'low' }).then((bitmap) => {
      if (this.worker !== w) { bitmap.close(); return; }
      const msg: SegIn = { type: 'frame', bitmap, ts: tMs };
      w.postMessage(msg, [bitmap]);
    }).catch(() => { if (this.worker === w) this.inFlight = false; });
  }

  private end(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = false;
    this.ready = false;
    this.smoother.reset();
  }

  stop(): void {
    this.end();
    this.errors = 0;
    this.gaveUp = false;
  }
}
