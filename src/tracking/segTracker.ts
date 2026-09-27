import { MaskSmoother, inputSize } from '../filters/mask';
import type { SegIn, SegOut } from './types';

type Opts = {
  onMask: (mask: Uint8Array, width: number, height: number) => void;
  onError?: (msg: string) => void;
};

// The selfie segmenter in its own worker (M4c). It runs only while a background scene is on.
export class SegTracker {
  private worker: Worker | null = null;
  private inFlight = false;
  private ready = false;
  private smoother = new MaskSmoother();

  constructor(private opts: Opts) {}

  get running(): boolean { return !!this.worker; }

  start(): void {
    if (this.worker) return;
    const w = new Worker(new URL('./seg.worker.ts', import.meta.url));
    this.worker = w;
    w.onmessage = (e: MessageEvent<SegOut>) => {
      if (this.worker !== w) return; // an answer of a worker that was stopped
      const m = e.data;
      if (m.type === 'ready') this.ready = true;
      else if (m.type === 'error') { this.inFlight = false; this.opts.onError?.(m.message); }
      else if (m.type === 'mask') { this.inFlight = false; this.opts.onMask(this.smoother.push(m.mask, m.width, m.height), m.width, m.height); }
    };
    const msg: SegIn = { type: 'init', wasmPath: `/mediapipe/${__MP_VER__}/wasm`, modelPath: '/models/selfie_segmenter-f16.tflite' };
    w.postMessage(msg);
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
    }).catch(() => { this.inFlight = false; });
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = false;
    this.ready = false;
    this.smoother.reset();
  }
}
