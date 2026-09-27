# M4c Animated Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The child picks a scene (underwater, grassland, spooky, space) and stands in it: the app cuts the person out of the camera picture and puts a moving scene behind, and a layer of the scene in front.

**Architecture:** A second worker runs the MediaPipe selfie segmenter on the CPU, on a small copy of the camera frame, and returns one person mask per frame. The main thread smooths the mask over time and uploads it as a small texture. The first render pass mixes scene and camera picture by the mask, before makeup and stickers, so filters, makeup, stickers, photos and recordings work as before. Scenes are data: layers (plate, far, near) that the shader moves, or a loop video.

**Tech Stack:** `@mediapipe/tasks-vision` ImageSegmenter (model `selfie_segmenter`, float16, Apache-2.0), Three.js (DataTexture, VideoTexture, ShaderMaterial), Preact signals, Vitest (node), Playwright smoke.

**Spec:** `docs/SPEC.md`, section "M4", part "M4c Animated backgrounds". Art: `astra/BRIEF.md` request R2 (not in git).

## Facts from the spike (2026-09-27, headless desktop Chromium)

| Question | Answer |
|---|---|
| Masks per result | One confidence mask, label `selfie`. Value 1 is person, 0 is background. |
| Mask size | The size of the input frame (640 x 480 in, 640 x 480 out), not the model size (256). |
| CPU delegate, square model | Median 24 ms per frame, 90 % under 46 ms. |
| CPU delegate, landscape model | Median 15 ms. Landscape frames only, so not for a phone held upright. |
| GPU delegate | Not measurable here (software GL). Known leak in tasks-vision 1.0.1 with continuous use (research/02, issue 6352). |
| Own worker next to the face worker | Works. Both run at the same time. |
| Telemetry | The second task posts to the same endpoint. The fetch guard blocks it. Zero third-party requests. |

Decisions from these facts: square model, CPU delegate, own worker, input frame scaled to 256 px on the long side before the transfer.

## Global Constraints

- Zero third-party requests at runtime. The new worker has the same fetch and XMLHttpRequest guard as the face worker. The model is served from the app origin.
- Works offline after the first load: model and scene files are cached.
- Licences allowed: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY. The model is Apache-2.0. Astra's art is CC0.
- The segmenter runs only while a scene is on. No scene: no second worker, no cost.
- With no scene the picture is pixel-identical to the build before (`ffmpeg -lavfi psnr`, expected `inf`).
- Kid UI: icons, 64 px tap targets, no reading required. Serbian (Latin) and English strings.
- Commit messages: plain conventional commits. No `Co-Authored-By`, no "Generated with".
- Every commit is gated on the vitest exit code.

## Review Focus

1. **Slow phone.** The mask arrives late or at a low rate. Expected: the picture keeps its frame rate, the mask lags a little, nothing blocks. Test in Task 2 (`drops frames while one is in work`).
2. **Scene on, then off.** Expected: the worker stops, the camera picture is back, no old mask stays. Test in Task 2 (`stops the worker`) and Task 3 (`no scene, no mask`).
3. **No person in the picture.** Expected: the scene fills the screen, no noise from a random mask. Test in Task 1 (`an empty mask stays empty after smoothing`).
4. **The scene file is not loaded yet or fails to load.** Expected: the camera picture stays until the scene is ready. Test in Task 3 (`waits for the scene`).
5. **Camera flip or rotation with a scene on.** Expected: the mask follows the new picture size, no stretched mask from the old size. Test in Task 1 (`starts again when the size changes`).

## File Structure

| File | Responsibility |
|---|---|
| `public/models/selfie_segmenter-f16.tflite` (new, committed) | The model, 250 KB. |
| `src/tracking/seg.worker.ts` (new) | Classic worker: guard, segmenter, one mask per frame as bytes. |
| `src/tracking/segTracker.ts` (new) | Worker life, frame hand-over, smoothing over time. |
| `src/filters/mask.ts` (new) | Pure: `blendMask`, `inputSize`. |
| `src/filters/scenes.ts` (new) | Scene list, `pickScene`, motion numbers per scene. |
| `src/render/backdrop.frag`, `src/render/backdropLayer.ts` (new) | Pass 1: scene behind the person, near layer in front. |
| `src/render/renderer.ts`, `src/app/*` | Wiring, dock tab 🏝️. |

---

### Task 1: Mask maths

**Files:** Create `src/filters/mask.ts`, `src/filters/mask.test.ts`.

**Interfaces (produces):**

```ts
export const MASK_EDGE = 256;                                   // long side of the frame that goes to the segmenter
export function inputSize(w: number, h: number): [number, number]; // frame size for the worker, same aspect, long side MASK_EDGE
export class MaskSmoother {
  constructor(keep?: number);                                    // share of the mask before that stays, default 0.4
  push(mask: Uint8Array, w: number, h: number): Uint8Array;      // smoothed mask, owned by the smoother
  reset(): void;
}
```

- [ ] **Step 1: Failing test** `src/filters/mask.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { inputSize, MaskSmoother, MASK_EDGE } from './mask';

describe('inputSize', () => {
  it('keeps the aspect and puts the long side at the edge', () => {
    expect(inputSize(1280, 720)).toEqual([MASK_EDGE, 144]);
    expect(inputSize(720, 1280)).toEqual([144, MASK_EDGE]);
    expect(inputSize(640, 480)).toEqual([MASK_EDGE, 192]);
  });
  it('does not enlarge a small frame', () => {
    expect(inputSize(160, 120)).toEqual([160, 120]);
  });
});

describe('MaskSmoother', () => {
  const mask = (v: number, n = 12) => new Uint8Array(n).fill(v);
  it('takes the first mask as it is', () => {
    expect([...new MaskSmoother().push(mask(200), 4, 3)]).toEqual([...mask(200)]);
  });
  it('moves toward the new mask, part of the way', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0), 4, 3);
    expect(s.push(mask(255), 4, 3)[0]).toBe(153); // 0.4 * 0 + 0.6 * 255
    expect(s.push(mask(255), 4, 3)[0]).toBe(214);
  });
  it('an empty mask stays empty after smoothing', () => {
    const s = new MaskSmoother();
    s.push(mask(0), 4, 3);
    expect(Math.max(...s.push(mask(0), 4, 3))).toBe(0);
  });
  it('starts again when the size changes', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0, 12), 4, 3);
    expect([...s.push(mask(255, 6), 3, 2)]).toEqual([...mask(255, 6)]);
  });
  it('starts again after reset', () => {
    const s = new MaskSmoother(0.4);
    s.push(mask(0), 4, 3);
    s.reset();
    expect(s.push(mask(255), 4, 3)[0]).toBe(255);
  });
});
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Write** `src/filters/mask.ts`

```ts
// Person mask of the selfie segmenter (M4c): sizes and smoothing over time.
export const MASK_EDGE = 256; // the model works at 256 x 256: a larger frame costs time and adds nothing

export function inputSize(w: number, h: number): [number, number] {
  const k = Math.min(1, MASK_EDGE / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}

// Hair and fingers flicker from frame to frame. A share of the mask before stays: less flicker, a little lag.
export class MaskSmoother {
  private last: Uint8Array | null = null;
  private w = 0;
  private h = 0;

  constructor(private keep = 0.4) {}

  push(mask: Uint8Array, w: number, h: number): Uint8Array {
    if (!this.last || this.w !== w || this.h !== h || this.last.length !== mask.length) {
      this.last = mask.slice(); this.w = w; this.h = h;
      return this.last;
    }
    const out = this.last, k = this.keep;
    for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * k + mask[i] * (1 - k));
    return out;
  }

  reset(): void { this.last = null; }
}
```

- [ ] **Step 4: Run, expect PASS. Step 5: Commit** `feat: person mask sizes and smoothing`

---

### Task 2: Segmenter worker and tracker

**Files:** Create `public/models/selfie_segmenter-f16.tflite`, `src/tracking/seg.worker.ts`, `src/tracking/segTracker.ts`, `src/tracking/segTracker.test.ts`. Modify `src/tracking/types.ts`, `scripts/attributions.mjs`, `src/about/*`, `LICENSE-ASSETS.md`.

**Model:** `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`, 249 537 bytes, SHA-256 `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`. Check the hash after the download.

**Interfaces (produces):**

```ts
// types.ts
export type SegIn = { type: 'init'; wasmPath: string; modelPath: string } | { type: 'frame'; bitmap: ImageBitmap; ts: number };
export type SegOut = { type: 'ready' } | { type: 'mask'; mask: Uint8Array; width: number; height: number; ts: number } | { type: 'error'; message: string };

// segTracker.ts
export class SegTracker {
  constructor(opts: { onMask: (mask: Uint8Array, width: number, height: number) => void; onError?: (msg: string) => void });
  start(): void;                                   // creates the worker. A second call does nothing
  push(video: HTMLVideoElement, tMs: number): void; // hands a small copy of the frame over, unless one is in work
  stop(): void;                                    // ends the worker, forgets the mask
  readonly running: boolean;
}
```

- [ ] **Step 1: Failing test** `src/tracking/segTracker.test.ts`, with a fake worker as in `faceTracker.test.ts`. Cases: no frame before `ready`. One frame in work at a time (`drops frames while one is in work`: three `push` calls in a row give one `frame` message). The frame goes out at `inputSize` (the test reads the options of the `createImageBitmap` stub: `resizeWidth`, `resizeHeight`). `onMask` gets the smoothed mask. An error from the worker frees the tracker for the next frame. `stop` ends the worker (`stops the worker`: `terminate` was called, `running` is false, a late mask message calls nothing). `start` after `stop` makes a new worker and the first mask is not mixed with the one before.

- [ ] **Step 2: Worker** `src/tracking/seg.worker.ts`: the guard block of `face.worker.ts` (same text), `importScripts` of the vision bundle, then:

```ts
const { FilesetResolver, ImageSegmenter } = Vision;
let seg: import('@mediapipe/tasks-vision').ImageSegmenter | null = null;
const post = (m: SegOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function init(wasmPath: string, modelPath: string) {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  // CPU on purpose: the mask is needed as bytes (no read-back from the GPU), and the GPU path leaks in 1.0.1
  seg = await ImageSegmenter.createFromOptions(vision, { baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
  post({ type: 'ready' });
}

function frame(bitmap: ImageBitmap, ts: number) {
  if (!seg) { bitmap.close(); return; }
  try {
    seg.segmentForVideo(bitmap, ts, (r) => {
      const m = r.confidenceMasks?.[0];
      if (!m) { post({ type: 'error', message: 'no mask' }); return; }
      const f = m.getAsFloat32Array(); // lives only inside this callback
      const mask = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) mask[i] = f[i] * 255;
      post({ type: 'mask', mask, width: m.width, height: m.height, ts }, [mask.buffer]);
    });
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 3: Guard test.** In `segTracker.test.ts`: both worker files contain the guard (`blocked egress`, the `fetch` wrap, the `XMLHttpRequest.prototype.open` wrap) before `importScripts`. A worker without the guard fails the test.

- [ ] **Step 4: Tracker** `src/tracking/segTracker.ts`, same shape as `FaceTracker`: `inFlight`, `ready`, `createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: 'low' })`, `MaskSmoother`.

- [ ] **Step 5: Licence records** (`MediaPipe Selfie Segmenter model`, Apache-2.0). **Step 6: Run all tests, commit** `feat: selfie segmenter in its own worker`

---

### Task 3: Backdrop layer

**Files:** Create `src/render/backdrop.frag`, `src/render/backdropLayer.ts`, `src/render/backdropLayer.test.ts`, `src/filters/scenes.ts`, `src/filters/scenes.test.ts`. Modify `src/render/renderer.ts`.

**Design:**
- The camera quad of pass 1 gets the backdrop shader in place of `copy.frag`. With no scene the shader returns the camera picture unchanged (`uOn` 0).
- Mask: one `DataTexture` (red channel, bytes, linear filter), size of the mask. The shader reads it with 5 taps (centre and 4 neighbours at 1.5 texels) and a steep curve: `smoothstep(0.35, 0.65, m)`.
- Scene fit: the scene covers the visible part of the stage (`coverScale` of `src/filters/faceon.ts`). For the front camera the scene is flipped in x in pass 1, because pass 2 mirrors the whole picture.
- Layers: `plate` (opaque), `far` (drifts: `uv.x += amount * sin(t * speed)`), `near` (over the person, sways). A loop video takes the place of `plate` (`THREE.VideoTexture` of a muted, looping, inline `<video>`). The video plays only while its scene is on and the page is visible (`pauseWhenHidden`).
- A scene is ready when its plate (or the first frame of its video) is loaded. Until then the camera picture stays.

**Interfaces (produces):**

```ts
// scenes.ts
export type Scene = { id: string; icon: string; chip?: string; plate: string; video?: string; far?: string; near?: string; drift?: number; sway?: number };
export const SCENES: Scene[];                 // filled when the art of request R2 arrives
export const BACKDROPS: { id: string; icon: string; img?: string }[]; // chips: none first
export function pickScene(current: string, id: string): string;

// backdropLayer.ts
export class BackdropLayer {
  constructor(material: THREE.ShaderMaterial, load?: Load);
  setMask(mask: Uint8Array, width: number, height: number): void;
  update(scene: Scene | null, mirror: boolean, tMs: number, canvas: [number, number], element: [number, number]): boolean; // true: the scene is drawn
  dispose(): void;
}
```

- [ ] Tests first (`no scene, no mask`: `uOn` is 0 and the mask texture is cleared; `waits for the scene`; mask texture follows the mask size; mirror flips the scene; time moves `uTime`). Then the code. Then the pixel check with no scene against the build before (`inf`).
- [ ] Commit `feat: backdrop layer, scene behind the person`

---

### Task 4: Dock tab, loop, smoke

- [ ] State: `scene = signal<string>('none')`. Dock tab `scene` 🏝️ after `faceon`. Strings `tabs.scene`: en "Places", sr "Mesta".
- [ ] `App.tsx`: one `SegTracker`. It starts when a scene is picked and stops with `none`, on a hidden page, and in face-on mode. In the loop: `seg.push(video, now)` while it runs.
- [ ] Smoke: with a scene on, the corner pixels of the stage change and the pixels at the nose stay (the person is kept). With `none` the picture is as before. `__fm.masks` counts the masks: more than 5 per second in the headless run. Zero third-party requests.
- [ ] Commit `feat: places tab`

---

### Task 5: Scenes from the art delivery (after request R2 arrives)

- [ ] `scripts/import-art.mjs`, job `backgrounds`: plates to WebP (1536 px, opaque), `far` and `near` to WebP with alpha, chips (128 px), loop videos re-encoded (H.264, 720 px square, CRF 28, no audio, `+faststart`). Size limits: 250 KB per plate, 1.5 MB per video.
- [ ] Fill `SCENES`. Tune `drift` and `sway` per scene on screenshots.
- [ ] Precache: plates, layers, chips. Videos: runtime cache (`CacheFirst`), so the first install stays small.
- [ ] Licence records. Commit `feat: scenes from the art delivery`

### Task 6: Documents, review, pull request

- [ ] `docs/SPEC.md`, `CLAUDE.md`, `TODO.md` (phone checks: edge quality on hair, frame rate with a scene and filters, a recording with a scene, battery heat after 5 minutes).
- [ ] Full verification, one fresh reviewer (Fable), fixes, pull request against `m4b-face-on`.
