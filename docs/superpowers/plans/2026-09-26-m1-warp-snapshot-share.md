# M1: Warp + Snapshot + Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A kid opens `https://face.mxa.sh` on an Android phone, sees their face with Big Eyes, taps once, and the photo lands in WhatsApp. Installable, offline after first use, zero third-party requests.

**Architecture:** Camera frames go from a `<video>` element to a Web Worker that runs MediaPipe FaceLandmarker. Landmarks come back, get smoothed by a One Euro filter, and become warp handles (centre, radius, strength, type). A Three.js full-screen quad renders the video texture through a fragment shader that applies the handles as backward-map radial warps. Preact draws the buttons. Snapshot is `canvas.toBlob`, share is `navigator.share({files})`.

**Tech Stack:** Vite 8.3, Preact 10.29 + TypeScript, Three.js 0.186, `@mediapipe/tasks-vision` 1.0.1, vite-plugin-pwa 1.3, Vitest 5, GitHub Actions + Pages, Njal.la DNS.

**Spec:** `docs/SPEC.md` (sections 2, 3, 4 M1, 5, 7). Research: `research/01-tech-stack-2026-09-26.md`, `research/02-filters-2026-09-26.md`, `research/03-mediapipe-telemetry-audit-2026-09-26.md`.

## Global Constraints

- Zero runtime requests to third parties. Production HTML carries `<meta http-equiv="Content-Security-Policy">` with `connect-src 'self'`.
- All wasm, model, font, and image assets served from the app origin. No CDN imports.
- Target: Android Chrome on mid-range 2022+ phones, 720p at 24 to 30 fps. Desktop Chrome or Edge. iOS out of scope.
- `numFaces: 2`. Own One Euro smoothing per face.
- Licenses: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY only.
- Public repo `github.com/mixashin/facemaker`. Pages at `https://face.mxa.sh`, Vite `base: '/'`.
- Branch flow: `main` is live. Work on feature branches, merge when it works on the phone.
- Commit messages: plain, no Co-Authored-By trailer.
- Kid mode: icons, big tap targets, no reading required.
- Node 24, npm 11 on the dev host (Windows 11, Git Bash for scripts).

## Review Focus

1. Camera permission denied or no camera: the app must show a large camera icon with a retry tap, not a black screen or a console error. Pinned in Task 4 (manual check) and Task 10 (UI state test).
2. No face in frame for more than 10 frames: warps must fade to identity, not freeze on stale handles. Pinned in Task 7 (`presets.test.ts`: empty landmarks give zero handles) and Task 6 (tracker clears state after 10 misses).
3. Two faces, one leaves: the remaining face keeps its own smoothing state, the departed face's state resets. Pinned in Task 6 (`faceTracker.test.ts`).
4. `navigator.share` missing or `canShare({files})` false (desktop Edge without targets, older Android): capture must still save the file. Pinned in Task 9 (`share.test.ts` with a stubbed navigator).
5. Device rotation and window resize: canvas and video keep cover fit, landmarks still align. Pinned in Task 8 (manual rotation check in the task's verification step).

---

### Task 1: Scaffold Vite + Preact + TypeScript, first commit, repo on GitHub

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/app/styles.css`, `.gitignore`, `README.md`, `LICENSE`
- Keep: `TODO.md`, `docs/`, `research/`

**Interfaces:**
- Produces: a running `npm run dev` on `http://localhost:5173` showing "facemaker" text. A GitHub repo with `main`.

- [ ] **Step 1: Scaffold in place**

Run in Git Bash from `C:/Users/mixa/projects/facemaker`:

```bash
npm create vite@latest . -- --template preact-ts
```

If the scaffolder refuses a non-empty directory, run it into `_scaffold`, then move every file except `node_modules` up one level and delete `_scaffold`.

- [ ] **Step 2: Install runtime and dev deps**

```bash
npm i three@0.186.1 @mediapipe/tasks-vision@1.0.1 preact@10.29.8
npm i -D vite-plugin-pwa@1.3.0 vitest@5.0.2 @types/three
```

- [ ] **Step 3: Replace `src/app/App.tsx`, `src/main.tsx`, `index.html`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#111111" />
    <title>Facemaker</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { render } from 'preact';
import { App } from './app/App';
import './app/styles.css';

render(<App />, document.getElementById('app')!);
```

`src/app/App.tsx`:

```tsx
export function App() {
  return <main class="app">facemaker</main>;
}
```

`src/app/styles.css`:

```css
:root {
  --bg: #111;
  --fg: #fff;
  --accent: #ff4fa3;
  --tap: 64px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; overflow: hidden; }
.app { position: relative; width: 100%; height: 100%; }
```

Delete the template's `src/app.tsx`, `src/app.css`, `src/index.css`, `src/assets/`, `public/vite.svg` if present.

- [ ] **Step 4: Add Vitest to `package.json` scripts and a `.gitignore` line for the wasm copy**

`package.json` scripts:

```json
"scripts": {
  "dev": "vite --host",
  "build": "tsc -b && vite build",
  "preview": "vite preview --host",
  "test": "vitest run",
  "postinstall": "node scripts/copy-mediapipe.mjs"
}
```

`.gitignore` additions:

```
node_modules
dist
public/mediapipe
.scrapling_cache
*.stackdump
```

`scripts/copy-mediapipe.mjs` (created now so `postinstall` does not fail, filled in Task 5):

```js
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe/wasm';
if (!existsSync(src)) process.exit(0);
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('copied mediapipe wasm to', dst);
```

- [ ] **Step 5: Run dev server, confirm the page renders**

Run: `npm run dev`
Expected: terminal prints a Local URL and a Network URL. Browser at `http://localhost:5173` shows "facemaker" on a dark background.

- [ ] **Step 6: LICENSE and README**

`LICENSE`: MIT, copyright 2026 Mixashin.

`README.md`:

```markdown
# facemaker

Camera toy for kids. Face warps, stickers, voice effects, photos and videos to share. Runs fully on the device. No accounts, no servers, no tracking.

Live: https://face.mxa.sh

## Dev

    npm i
    npm run dev        # http://localhost:5173
    npm test

Phone loop: `adb reverse tcp:5173 tcp:5173`, then open http://localhost:5173 in Chrome on the phone.

Spec: docs/SPEC.md. Backlog: TODO.md. Research: research/.
```

- [ ] **Step 7: Init git, first commit, create the public GitHub repo**

```bash
git init -b main
git add -A
git commit -m "chore: scaffold vite + preact + typescript"
gh repo create mixashin/facemaker --public --source . --push --description "Camera toy for kids: face warps, stickers, voice effects. Local-only PWA."
```

Expected: `gh` prints the repo URL. `git remote -v` shows origin.

---

### Task 2: PWA plugin, manifest, icons, production CSP

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icons/icon.svg`, `public/CNAME`, `src/csp.ts` (Vite plugin)
- Generated: `public/icons/pwa-192x192.png`, `public/icons/pwa-512x512.png`, `public/icons/maskable-512x512.png`, `public/icons/apple-touch-icon.png`

**Interfaces:**
- Produces: `npm run build` emits `dist/manifest.webmanifest`, `dist/sw.js`, and an `index.html` whose `<head>` contains the CSP meta tag. `npm run dev` has no CSP meta (HMR needs a websocket).

- [ ] **Step 1: Write the CSP plugin**

`src/csp.ts`:

```ts
import type { Plugin } from 'vite';

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export function cspPlugin(): Plugin {
  return {
    name: 'facemaker-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}
```

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './src/csp';

export default defineConfig({
  base: '/',
  plugins: [
    preact(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Facemaker',
        short_name: 'Facemaker',
        description: 'Face warps, stickers and voice effects. Local only.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { environment: 'node' },
});
```

Note: `globPatterns` deliberately excludes `.wasm` and `.task`. The three wasm variants total 34 MB. Runtime caching stores only the variant the browser fetched. The app works offline after the first camera start. If precaching becomes wanted later, add `wasm,task` to the pattern and set `maximumFileSizeToCacheInBytes: 15_000_000`.

- [ ] **Step 3: Draw the icon and generate PNGs**

`public/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#111"/>
  <circle cx="256" cy="256" r="150" fill="#ffd166"/>
  <circle cx="200" cy="225" r="34" fill="#111"/>
  <circle cx="312" cy="225" r="34" fill="#111"/>
  <path d="M170 300 Q256 380 342 300" stroke="#111" stroke-width="22" fill="none" stroke-linecap="round"/>
</svg>
```

Generate PNGs (one-off, dev dep from the vite-pwa org):

```bash
npx --yes @vite-pwa/assets-generator@2.0.0 --preset minimal-2023 public/icons/icon.svg
```

Expected: files `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` next to the svg. Rename `maskable-icon-512x512.png` to `maskable-512x512.png` and `apple-touch-icon-180x180.png` to `apple-touch-icon.png` so the manifest paths above match.

- [ ] **Step 4: `public/CNAME`**

```
face.mxa.sh
```

- [ ] **Step 5: Build and inspect**

Run: `npm run build && ls dist && grep -c "Content-Security-Policy" dist/index.html && cat dist/manifest.webmanifest | head -c 400`
Expected: `dist/` contains `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js`, `icons/`, `CNAME`. grep prints `1`. Manifest shows name Facemaker and three icons.

Run: `npm run dev` then view page source in the browser.
Expected: no CSP meta tag in dev (the plugin has `apply: 'build'`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pwa manifest, icons, service worker, production csp"
```

---

### Task 3: GitHub Actions deploy to Pages with custom domain

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: every push to `main` builds and deploys. Pull requests run build + test only. `https://face.mxa.sh` serves `dist/`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Build and deploy

on:
  push:
    branches: ['main']
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: './dist'

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/configure-pages@v6
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Enable Pages with the Actions source and set the custom domain**

```bash
gh api -X POST repos/mixashin/facemaker/pages -f build_type=workflow 2>/dev/null || gh api -X PUT repos/mixashin/facemaker/pages -f build_type=workflow
gh api -X PUT repos/mixashin/facemaker/pages -f cname=face.mxa.sh
```

Expected: first command returns a JSON with `"build_type":"workflow"`. Second returns 204 or JSON with `"cname":"face.mxa.sh"`.

- [ ] **Step 3: DNS CNAME at Njal.la**

Read `~/.claude/context/domains.md` for the Njal.la API call shape. Add record: type `CNAME`, name `face`, content `mixashin.github.io.`, TTL 3600, on domain `mxa.sh`. Use `$NJALLA_TOKEN`. Never echo the token.

Verify: `nslookup face.mxa.sh 1.1.1.1` shows a CNAME to `mixashin.github.io`. Propagation can take minutes.

- [ ] **Step 4: Commit, push, watch the run**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build, test and deploy to github pages"
git push
gh run watch
```

Expected: build and deploy jobs green. `curl -sI https://face.mxa.sh | head -1` returns `HTTP/2 200` after the certificate is issued (GitHub issues it automatically once DNS resolves, up to an hour).

- [ ] **Step 5: Enforce HTTPS once the certificate exists**

```bash
gh api -X PUT repos/mixashin/facemaker/pages -F https_enforced=true
```

Expected: 204. Browser at `http://face.mxa.sh` redirects to https.

---

### Task 4: Camera module

**Files:**
- Create: `src/camera/camera.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Facing = 'user' | 'environment';
  export async function startCamera(video: HTMLVideoElement, facing: Facing): Promise<MediaStream>;
  export function stopCamera(video: HTMLVideoElement): void;
  ```
  Resolves when the video has dimensions and is playing. Rejects with the DOMException from `getUserMedia` (`NotAllowedError`, `NotFoundError`, ...).

- [ ] **Step 1: Write the module**

`src/camera/camera.ts`:

```ts
export type Facing = 'user' | 'environment';

export async function startCamera(video: HTMLVideoElement, facing: Facing): Promise<MediaStream> {
  stopCamera(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true }));
  }
  return stream;
}

export function stopCamera(video: HTMLVideoElement): void {
  const s = video.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
```

- [ ] **Step 2: Wire a throwaway check into `App.tsx`**

Temporarily:

```tsx
import { useEffect, useRef } from 'preact/hooks';
import { startCamera } from '../camera/camera';

export function App() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    startCamera(ref.current!, 'user').catch((e) => console.error('camera', e.name));
  }, []);
  return (
    <main class="app">
      <video ref={ref} style="width:100%;height:100%;object-fit:cover" />
    </main>
  );
}
```

- [ ] **Step 3: Manual check on desktop and phone**

Desktop: `npm run dev`, open `http://localhost:5173`, allow camera. Expected: live mirror-free video fills the window.

Phone: `adb reverse tcp:5173 tcp:5173`, open `http://localhost:5173` in Chrome on the phone. Expected: permission prompt, then live video. Deny once and reload: console shows `camera NotAllowedError` (the UI for this arrives in Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/camera/camera.ts src/app/App.tsx
git commit -m "feat: camera start/stop with facing mode"
```

---

### Task 5: MediaPipe assets and the face worker

**Files:**
- Create: `src/tracking/face.worker.ts`, `src/tracking/types.ts`, `public/models/face_landmarker.task`
- Verify: `scripts/copy-mediapipe.mjs` from Task 1 produced `public/mediapipe/wasm/`

**Interfaces:**
- Produces (worker protocol, `src/tracking/types.ts`):
  ```ts
  export type WorkerIn =
    | { type: 'init'; wasmPath: string; modelPath: string; numFaces: number }
    | { type: 'frame'; bitmap: ImageBitmap; ts: number };
  export type FaceResult = {
    landmarks: Float32Array;   // numFaces * 478 * 3, x y z normalized, faces packed in order
    count: number;             // faces detected this frame
    matrices: Float32Array;    // count * 16, column-major 4x4
    blend: Float32Array;       // count * 52
    width: number; height: number;
  };
  export type WorkerOut =
    | { type: 'ready'; delegate: 'GPU' | 'CPU' }
    | { type: 'result'; result: FaceResult; ts: number }
    | { type: 'error'; message: string };
  ```

- [ ] **Step 1: Download the model into the repo**

```bash
mkdir -p public/models
curl -sL -o public/models/face_landmarker.task "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
ls -la public/models
```

Expected: `face_landmarker.task` is 3758596 bytes. Commit it (3.7 MB, one-time).

- [ ] **Step 2: Confirm the wasm copy**

```bash
node scripts/copy-mediapipe.mjs && ls public/mediapipe/wasm
```

Expected: `vision_wasm_internal.js`, `vision_wasm_internal.wasm`, `vision_wasm_nosimd_internal.js`, `vision_wasm_nosimd_internal.wasm`, and the `_module_` pair.

- [ ] **Step 3: Write `src/tracking/types.ts`** (content as in Interfaces above, verbatim).

- [ ] **Step 4: Write the worker**

`src/tracking/face.worker.ts`:

```ts
/// <reference lib="webworker" />
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { WorkerIn, WorkerOut, FaceResult } from './types';

let landmarker: FaceLandmarker | null = null;
let numFaces = 2;

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function init(wasmPath: string, modelPath: string, faces: number) {
  numFaces = faces;
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numFaces,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      canvas: delegate === 'GPU' ? new OffscreenCanvas(1, 1) : undefined,
    });
  try {
    landmarker = await make('GPU');
    post({ type: 'ready', delegate: 'GPU' });
  } catch (e) {
    landmarker = await make('CPU');
    post({ type: 'ready', delegate: 'CPU' });
  }
}

function frame(bitmap: ImageBitmap, ts: number) {
  if (!landmarker) { bitmap.close(); return; }
  const w = bitmap.width, h = bitmap.height;
  let res;
  try {
    res = landmarker.detectForVideo(bitmap, ts);
  } finally {
    bitmap.close();
  }
  const count = Math.min(res.faceLandmarks.length, numFaces);
  const landmarks = new Float32Array(numFaces * 478 * 3);
  const matrices = new Float32Array(count * 16);
  const blend = new Float32Array(count * 52);
  for (let f = 0; f < count; f++) {
    const lm = res.faceLandmarks[f];
    for (let i = 0; i < 478 && i < lm.length; i++) {
      const o = (f * 478 + i) * 3;
      landmarks[o] = lm[i].x; landmarks[o + 1] = lm[i].y; landmarks[o + 2] = lm[i].z;
    }
    const m = res.facialTransformationMatrixes?.[f]?.data;
    if (m) matrices.set(m, f * 16);
    const b = res.faceBlendshapes?.[f]?.categories;
    if (b) for (let i = 0; i < 52 && i < b.length; i++) blend[f * 52 + i] = b[i].score;
  }
  const result: FaceResult = { landmarks, count, matrices, blend, width: w, height: h };
  post({ type: 'result', result, ts }, [landmarks.buffer, matrices.buffer, blend.buffer]);
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === 'init') init(m.wasmPath, m.modelPath, m.numFaces).catch((err) => post({ type: 'error', message: String(err?.message ?? err) }));
  else if (m.type === 'frame') {
    try { frame(m.bitmap, m.ts); } catch (err) { post({ type: 'error', message: String((err as Error)?.message ?? err) }); }
  }
};
```

Note on `canvas`: the 1.0.1 typings say GPU processing needs a canvas. `OffscreenCanvas` is valid in a worker. If `createFromOptions` throws on GPU, the code falls back to CPU and reports which one it used.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors. If `canvas` is rejected by the option type, cast the options object with `as any` on that one line and note it.

- [ ] **Step 6: Commit**

```bash
git add public/models/face_landmarker.task src/tracking/types.ts src/tracking/face.worker.ts
git commit -m "feat: face landmarker worker with gpu/cpu fallback"
```

---

### Task 6: One Euro filter and the main-thread tracker client

**Files:**
- Create: `src/tracking/oneEuro.ts`, `src/tracking/oneEuro.test.ts`, `src/tracking/faceTracker.ts`, `src/tracking/faceTracker.test.ts`

**Interfaces:**
- Consumes: `WorkerIn`, `WorkerOut`, `FaceResult` from Task 5.
- Produces:
  ```ts
  // oneEuro.ts
  export class OneEuro { constructor(minCutoff?: number, beta?: number, dCutoff?: number); filter(x: number, tMs: number): number; reset(): void; }
  export class OneEuroArray { constructor(n: number, minCutoff?: number, beta?: number); filter(src: Float32Array, dst: Float32Array, tMs: number): void; reset(): void; }
  // faceTracker.ts
  export type Face = { landmarks: Float32Array /* 478*3 */; matrix: Float32Array /* 16 */; blend: Float32Array /* 52 */ };
  export class FaceTracker {
    constructor(opts: { numFaces: number; onFaces: (faces: Face[]) => void; onReady?: (delegate: 'GPU'|'CPU') => void; onError?: (msg: string) => void });
    start(): void;                          // creates the worker and inits it
    push(video: HTMLVideoElement, tMs: number): void; // sends a frame if none in flight
    stop(): void;
    smooth(result: FaceResult, tMs: number): Face[];  // pure, exported for tests
  }
  ```
  Behaviour: one frame in flight at a time. After 10 consecutive frames with `count === 0`, `onFaces([])` is emitted and all smoothing state resets. Per-face state resets when that face index is absent.

- [ ] **Step 1: Write the failing One Euro test**

`src/tracking/oneEuro.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OneEuro, OneEuroArray } from './oneEuro';

describe('OneEuro', () => {
  it('passes a constant through unchanged', () => {
    const f = new OneEuro(1.0, 0.007);
    let y = 0;
    for (let i = 0; i < 20; i++) y = f.filter(0.5, i * 33);
    expect(y).toBeCloseTo(0.5, 6);
  });

  it('damps jitter on a still signal', () => {
    const f = new OneEuro(1.0, 0.007);
    const noisy = [0.5, 0.52, 0.48, 0.51, 0.49, 0.5, 0.52, 0.48];
    const out = noisy.map((v, i) => f.filter(v, i * 33));
    const spread = Math.max(...out.slice(2)) - Math.min(...out.slice(2));
    expect(spread).toBeLessThan(0.02);
  });

  it('follows a fast ramp with little lag', () => {
    const f = new OneEuro(1.0, 0.007);
    let y = 0;
    for (let i = 0; i < 30; i++) y = f.filter(i / 30, i * 33);
    expect(y).toBeGreaterThan(0.85);
  });

  it('array variant filters each index independently', () => {
    const f = new OneEuroArray(2);
    const dst = new Float32Array(2);
    f.filter(new Float32Array([0.2, 0.8]), dst, 0);
    f.filter(new Float32Array([0.2, 0.8]), dst, 33);
    expect(dst[0]).toBeCloseTo(0.2, 4);
    expect(dst[1]).toBeCloseTo(0.8, 4);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/tracking/oneEuro.test.ts`
Expected: FAIL, cannot resolve `./oneEuro`.

- [ ] **Step 3: Implement One Euro**

`src/tracking/oneEuro.ts`:

```ts
// One Euro filter (Casiez, Roussel, Vogel 2012). Units: tMs in milliseconds.
const TWO_PI = 2 * Math.PI;

function alpha(cutoff: number, dtSec: number): number {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dtSec);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;
  constructor(private minCutoff = 1.0, private beta = 0.007, private dCutoff = 1.0) {}

  reset(): void { this.x = null; this.dx = 0; this.t = null; }

  filter(x: number, tMs: number): number {
    if (this.x === null || this.t === null) { this.x = x; this.t = tMs; return x; }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3);
    this.t = tMs;
    const dxRaw = (x - this.x) / dt;
    const ad = alpha(this.dCutoff, dt);
    this.dx = ad * dxRaw + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * x + (1 - a) * this.x;
    return this.x;
  }
}

export class OneEuroArray {
  private filters: OneEuro[];
  constructor(n: number, minCutoff = 1.0, beta = 0.007) {
    this.filters = Array.from({ length: n }, () => new OneEuro(minCutoff, beta));
  }
  reset(): void { this.filters.forEach((f) => f.reset()); }
  filter(src: Float32Array, dst: Float32Array, tMs: number): void {
    for (let i = 0; i < this.filters.length; i++) dst[i] = this.filters[i].filter(src[i], tMs);
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/tracking/oneEuro.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the failing tracker test**

`src/tracking/faceTracker.test.ts`:

```ts
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
```

- [ ] **Step 6: Run, expect failure**

Run: `npx vitest run src/tracking/faceTracker.test.ts`
Expected: FAIL, cannot resolve `./faceTracker`.

- [ ] **Step 7: Implement the tracker**

`src/tracking/faceTracker.ts`:

```ts
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
    this.filters = Array.from({ length: opts.numFaces }, () => new OneEuroArray(LM, 1.0, 0.007));
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
```

- [ ] **Step 8: Run all tests, expect pass**

Run: `npm test`
Expected: 7 passed (4 One Euro + 3 tracker).

- [ ] **Step 9: Commit**

```bash
git add src/tracking/
git commit -m "feat: one euro smoothing and face tracker client"
```

---

### Task 7: Warp presets from landmarks

**Files:**
- Create: `src/filters/presets.ts`, `src/filters/presets.test.ts`

**Interfaces:**
- Consumes: `Face` from Task 6.
- Produces:
  ```ts
  export type HandleType = 0 | 1;   // 0 = scale (bulge when strength>0, pinch when <0), 1 = swirl
  export type Handle = { cx: number; cy: number; r: number; strength: number; type: HandleType };
  export type PresetId = 'none' | 'bigEyes' | 'bigMouth' | 'bigHead' | 'smallFace' | 'bulge' | 'swirl';
  export const PRESETS: { id: PresetId; icon: string }[];
  export function handlesFor(preset: PresetId, faces: Face[], aspect: number): Handle[];
  ```
  `aspect` = video width / height. Radii are in normalized video x units. `handlesFor` returns `[]` for `'none'` or no faces.

- [ ] **Step 1: Write the failing test**

`src/filters/presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { handlesFor, PRESETS } from './presets';
import type { Face } from '../tracking/faceTracker';

function face(): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5);           // cheeks: face width 0.4
  set(10, 0.5, 0.2); set(152, 0.5, 0.8);            // forehead top, chin
  set(13, 0.5, 0.62); set(14, 0.5, 0.64);           // inner lips
  for (let i = 468; i < 473; i++) set(i, 0.42, 0.45); // left iris
  for (let i = 473; i < 478; i++) set(i, 0.58, 0.45); // right iris
  set(4, 0.5, 0.5);                                 // nose tip
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}

describe('handlesFor', () => {
  it('returns nothing for none or no faces', () => {
    expect(handlesFor('none', [face()], 16 / 9)).toEqual([]);
    expect(handlesFor('bigEyes', [], 16 / 9)).toEqual([]);
  });

  it('bigEyes gives two positive scale handles centred on the irises', () => {
    const h = handlesFor('bigEyes', [face()], 16 / 9);
    expect(h).toHaveLength(2);
    expect(h[0].cx).toBeCloseTo(0.42, 4); expect(h[0].cy).toBeCloseTo(0.45, 4);
    expect(h[1].cx).toBeCloseTo(0.58, 4);
    expect(h[0].strength).toBeGreaterThan(0); expect(h[0].type).toBe(0);
    expect(h[0].r).toBeCloseTo(0.4 * 0.22, 4);
  });

  it('smallFace gives one negative handle on the face centre', () => {
    const h = handlesFor('smallFace', [face()], 16 / 9);
    expect(h).toHaveLength(1);
    expect(h[0].strength).toBeLessThan(0);
    expect(h[0].cx).toBeCloseTo(0.5, 4); expect(h[0].cy).toBeCloseTo(0.5, 4);
  });

  it('two faces double the handles', () => {
    expect(handlesFor('bigMouth', [face(), face()], 16 / 9)).toHaveLength(2);
  });

  it('every preset has an icon', () => {
    for (const p of PRESETS) expect(p.icon.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/filters/presets.test.ts`
Expected: FAIL, cannot resolve `./presets`.

- [ ] **Step 3: Implement**

`src/filters/presets.ts`:

```ts
import type { Face } from '../tracking/faceTracker';

export type HandleType = 0 | 1;
export type Handle = { cx: number; cy: number; r: number; strength: number; type: HandleType };
export type PresetId = 'none' | 'bigEyes' | 'bigMouth' | 'bigHead' | 'smallFace' | 'bulge' | 'swirl';

export const PRESETS: { id: PresetId; icon: string }[] = [
  { id: 'none', icon: '🙂' },
  { id: 'bigEyes', icon: '👀' },
  { id: 'bigMouth', icon: '👄' },
  { id: 'bigHead', icon: '🎈' },
  { id: 'smallFace', icon: '🤏' },
  { id: 'bulge', icon: '🔍' },
  { id: 'swirl', icon: '🌀' },
];

// Landmark indices (MediaPipe canonical face mesh)
const L_CHEEK = 234, R_CHEEK = 454, TOP = 10, CHIN = 152, LIP_U = 13, LIP_L = 14, NOSE = 4;
const L_IRIS = [468, 469, 470, 471, 472], R_IRIS = [473, 474, 475, 476, 477];

function pt(lm: Float32Array, i: number): [number, number] { return [lm[i * 3], lm[i * 3 + 1]]; }
function mean(lm: Float32Array, idx: number[]): [number, number] {
  let x = 0, y = 0;
  for (const i of idx) { x += lm[i * 3]; y += lm[i * 3 + 1]; }
  return [x / idx.length, y / idx.length];
}

function faceHandles(preset: PresetId, lm: Float32Array): Handle[] {
  const [lx] = pt(lm, L_CHEEK), [rx] = pt(lm, R_CHEEK);
  const width = Math.abs(rx - lx);
  const [cx, cy] = pt(lm, NOSE);
  const [, ty] = pt(lm, TOP), [, by] = pt(lm, CHIN);
  const height = Math.abs(by - ty);
  const [lex, ley] = mean(lm, L_IRIS), [rex, rey] = mean(lm, R_IRIS);
  const [mux, muy] = pt(lm, LIP_U), [mlx, mly] = pt(lm, LIP_L);
  const mouth: [number, number] = [(mux + mlx) / 2, (muy + mly) / 2];

  switch (preset) {
    case 'bigEyes':
      return [
        { cx: lex, cy: ley, r: width * 0.22, strength: 0.55, type: 0 },
        { cx: rex, cy: rey, r: width * 0.22, strength: 0.55, type: 0 },
      ];
    case 'bigMouth':
      return [{ cx: mouth[0], cy: mouth[1], r: width * 0.35, strength: 0.6, type: 0 }];
    case 'bigHead':
      return [{ cx, cy: (ty + by) / 2, r: Math.max(width, height) * 0.95, strength: 0.4, type: 0 }];
    case 'smallFace':
      return [{ cx, cy, r: Math.max(width, height) * 0.8, strength: -0.45, type: 0 }];
    case 'bulge':
      return [{ cx, cy, r: width * 0.5, strength: 0.7, type: 0 }];
    case 'swirl':
      return [{ cx, cy, r: width * 0.6, strength: 1.2, type: 1 }];
    default:
      return [];
  }
}

export function handlesFor(preset: PresetId, faces: Face[], _aspect: number): Handle[] {
  if (preset === 'none' || faces.length === 0) return [];
  return faces.flatMap((f) => faceHandles(preset, f.landmarks));
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/filters/presets.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/filters/
git commit -m "feat: warp handle presets from landmarks"
```

---

### Task 8: Three.js renderer with the warp shader

**Files:**
- Create: `src/render/renderer.ts`, `src/render/warp.frag`, `src/render/quad.vert`, `src/vite-env.d.ts` (add `?raw` typing if missing)

**Interfaces:**
- Consumes: `Handle` from Task 7.
- Produces:
  ```ts
  export class FaceRenderer {
    constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement);
    setMirror(on: boolean): void;
    setHandles(h: Handle[]): void;     // up to 16, extra ignored
    resize(): void;                    // canvas buffer = video size
    render(): void;                    // one frame
    dispose(): void;
  }
  ```
  Canvas drawing buffer equals video resolution. CSS makes it cover the viewport. `preserveDrawingBuffer: true` so `toBlob` works after `render()`.

- [ ] **Step 1: Shaders**

`src/render/quad.vert`:

```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
```

`src/render/warp.frag`:

```glsl
precision highp float;
#define MAX_H 16
uniform sampler2D uTex;
uniform float uAspect;        // width / height of the video
uniform bool uMirror;
uniform int uCount;
uniform vec4 uHandle[MAX_H];  // cx, cy, r, strength (normalized video coords, r in x units)
uniform float uType[MAX_H];   // 0 scale, 1 swirl
varying vec2 vUv;

void main() {
  // Work in unmirrored video space. Flip the *display* only.
  vec2 uv = uMirror ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  for (int i = 0; i < MAX_H; i++) {
    if (i >= uCount) break;
    vec4 h = uHandle[i];
    vec2 c = h.xy;
    vec2 d = uv - c;
    vec2 da = vec2(d.x, d.y / uAspect);          // isotropic distance in x units
    float dist = length(da);
    float r = h.z;
    if (dist >= r || r <= 0.0) continue;
    float t = dist / r;
    float f = (1.0 - t * t);
    f = f * f;                                    // flat at centre and rim, no folding
    if (uType[i] < 0.5) {
      // scale: strength>0 samples closer to centre (magnify), <0 samples farther (shrink)
      uv = c + d * (1.0 - h.w * f);
    } else {
      float ang = h.w * f;
      float s = sin(ang), co = cos(ang);
      vec2 rot = vec2(co * da.x - s * da.y, s * da.x + co * da.y);
      uv = c + vec2(rot.x, rot.y * uAspect);
    }
  }
  uv = clamp(uv, 0.0, 1.0);
  gl_FragColor = texture2D(uTex, uv);
}
```

- [ ] **Step 2: Renderer**

`src/render/renderer.ts`:

```ts
import * as THREE from 'three';
import vert from './quad.vert?raw';
import frag from './warp.frag?raw';
import type { Handle } from '../filters/presets';

const MAX_H = 16;

export class FaceRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private tex: THREE.VideoTexture;
  private mat: THREE.ShaderMaterial;
  private handles = new Float32Array(MAX_H * 4);
  private types = new Float32Array(MAX_H);

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.tex = new THREE.VideoTexture(video);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTex: { value: this.tex },
        uAspect: { value: 16 / 9 },
        uMirror: { value: true },
        uCount: { value: 0 },
        uHandle: { value: Array.from({ length: MAX_H }, () => new THREE.Vector4()) },
        uType: { value: Array.from({ length: MAX_H }, () => 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  setMirror(on: boolean): void { this.mat.uniforms.uMirror.value = on; }

  setHandles(h: Handle[]): void {
    const n = Math.min(h.length, MAX_H);
    const arr = this.mat.uniforms.uHandle.value as THREE.Vector4[];
    const types = this.mat.uniforms.uType.value as number[];
    for (let i = 0; i < n; i++) { arr[i].set(h[i].cx, h[i].cy, h[i].r, h[i].strength); types[i] = h[i].type; }
    this.mat.uniforms.uCount.value = n;
  }

  resize(): void {
    const w = this.video.videoWidth || 1280, hgt = this.video.videoHeight || 720;
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.renderer.setSize(w, hgt, false);
      this.mat.uniforms.uAspect.value = w / hgt;
    }
  }

  render(): void {
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.tex.dispose(); this.mat.dispose(); this.renderer.dispose(); }
}
```

If `import x from './file?raw'` has no type, add to `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

(Vite's client types already declare `*?raw`.)

- [ ] **Step 3: Wire a throwaway loop in `App.tsx` to see the warp**

```tsx
import { useEffect, useRef } from 'preact/hooks';
import { startCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesFor } from '../filters/presets';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current!, canvas = canvasRef.current!;
    let faces: Face[] = [];
    const r = new FaceRenderer(canvas, video);
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => { faces = f; }, onReady: (d) => console.log('delegate', d), onError: console.error });
    let raf = 0;
    const loop = (now: number) => {
      t.push(video, now);
      r.setHandles(handlesFor('bigEyes', faces, video.videoWidth / video.videoHeight));
      r.render();
      raf = requestAnimationFrame(loop);
    };
    startCamera(video, 'user').then(() => { t.start(); raf = requestAnimationFrame(loop); }).catch(console.error);
    return () => { cancelAnimationFrame(raf); t.stop(); r.dispose(); };
  }, []);
  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" />
    </main>
  );
}
```

Add to `styles.css`:

```css
.hidden-video { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.stage { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
```

- [ ] **Step 4: Manual check, desktop then phone**

Desktop `npm run dev`: eyes grow, warp follows the face, no seam at the handle rim, mirror feels natural (move left, image moves left).

Phone via `adb reverse`: same. Console shows `delegate GPU` (or CPU on fallback). Rotate the phone: video re-fits, eyes still line up. Measure fps: add `console.log` of frames per second for 5 s, expect 24 or more with GPU delegate.

If the warp lands beside the eyes on the front camera: the mirror flip is being applied twice. `uMirror` flips the display only. Landmarks are in raw video space. Check that no other flip exists.

- [ ] **Step 5: Commit**

```bash
git add src/render/ src/app/ src/vite-env.d.ts
git commit -m "feat: three.js warp renderer with radial handles"
```

---

### Task 9: Snapshot, download, share

**Files:**
- Create: `src/capture/snapshot.ts`, `src/capture/share.ts`, `src/capture/share.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // snapshot.ts
  export function snapshot(canvas: HTMLCanvasElement, quality?: number): Promise<File>; // image/jpeg, name facemaker-<ts>.jpg
  // share.ts
  export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';
  export function canShareFile(file: File, nav?: Navigator): boolean;
  export function downloadFile(file: File, doc?: Document): void;
  export function shareOrDownload(file: File, nav?: Navigator, doc?: Document): Promise<ShareOutcome>;
  ```

- [ ] **Step 1: Write the failing share test**

`src/capture/share.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { canShareFile, shareOrDownload } from './share';

const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' });

function fakeDoc() {
  const clicks: string[] = [];
  const a = { href: '', download: '', click: () => clicks.push(a.download), remove: () => {} };
  const doc = { createElement: () => a, body: { appendChild: () => {} } } as unknown as Document;
  return { doc, clicks };
}

describe('share', () => {
  it('canShareFile is false without navigator.share', () => {
    expect(canShareFile(file, {} as Navigator)).toBe(false);
  });

  it('downloads when share is unavailable', async () => {
    const { doc, clicks } = fakeDoc();
    (globalThis as any).URL.createObjectURL ??= () => 'blob:x';
    (globalThis as any).URL.revokeObjectURL ??= () => {};
    const out = await shareOrDownload(file, {} as Navigator, doc);
    expect(out).toBe('downloaded');
    expect(clicks).toEqual(['x.jpg']);
  });

  it('shares when canShare says yes', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { canShare: () => true, share } as unknown as Navigator;
    const out = await shareOrDownload(file, nav, fakeDoc().doc);
    expect(out).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Facemaker' });
  });

  it('reports cancelled on AbortError without downloading', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(err) } as unknown as Navigator;
    const { doc, clicks } = fakeDoc();
    expect(await shareOrDownload(file, nav, doc)).toBe('cancelled');
    expect(clicks).toEqual([]);
  });

  it('falls back to download on other share errors', async () => {
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as Navigator;
    const { doc, clicks } = fakeDoc();
    expect(await shareOrDownload(file, nav, doc)).toBe('downloaded');
    expect(clicks).toEqual(['x.jpg']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/capture/share.test.ts`
Expected: FAIL, cannot resolve `./share`.

- [ ] **Step 3: Implement share and snapshot**

`src/capture/share.ts`:

```ts
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canShareFile(file: File, nav: Navigator = navigator): boolean {
  return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

export function downloadFile(file: File, doc: Document = document): void {
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareOrDownload(file: File, nav: Navigator = navigator, doc: Document = document): Promise<ShareOutcome> {
  if (!canShareFile(file, nav)) { downloadFile(file, doc); return 'downloaded'; }
  try {
    await nav.share({ files: [file], title: 'Facemaker' });
    return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
    downloadFile(file, doc);
    return 'downloaded';
  }
}
```

`src/capture/snapshot.ts`:

```ts
export function snapshot(canvas: HTMLCanvasElement, quality = 0.92): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob returned null'));
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      resolve(new File([blob], `facemaker-${ts}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/capture/
git commit -m "feat: jpeg snapshot with share sheet and download fallback"
```

---

### Task 10: Kid UI: filter strip, capture button, camera flip, error state

**Files:**
- Create: `src/app/FilterStrip.tsx`, `src/app/CaptureButton.tsx`, `src/app/state.ts`, `src/app/state.test.ts`
- Modify: `src/app/App.tsx`, `src/app/styles.css`

**Interfaces:**
- `src/app/state.ts`:
  ```ts
  import { signal } from '@preact/signals';
  export const preset = signal<PresetId>('bigEyes');
  export const facing = signal<Facing>('user');
  export const camState = signal<'idle' | 'starting' | 'live' | 'denied' | 'nocam' | 'error'>('idle');
  export const flash = signal(false);
  export function camStateFromError(name: string): 'denied' | 'nocam' | 'error';
  ```

- [ ] **Step 1: Install signals**

```bash
npm i @preact/signals@latest
```

- [ ] **Step 2: Failing state test**

`src/app/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { camStateFromError } from './state';

describe('camStateFromError', () => {
  it('maps permission errors to denied', () => {
    expect(camStateFromError('NotAllowedError')).toBe('denied');
    expect(camStateFromError('SecurityError')).toBe('denied');
  });
  it('maps missing hardware to nocam', () => {
    expect(camStateFromError('NotFoundError')).toBe('nocam');
    expect(camStateFromError('OverconstrainedError')).toBe('nocam');
  });
  it('maps anything else to error', () => {
    expect(camStateFromError('AbortError')).toBe('error');
  });
});
```

Run: `npx vitest run src/app/state.test.ts`
Expected: FAIL, cannot resolve `./state`.

- [ ] **Step 3: Implement state**

`src/app/state.ts`:

```ts
import { signal } from '@preact/signals';
import type { PresetId } from '../filters/presets';
import type { Facing } from '../camera/camera';

export type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'nocam' | 'error';

export const preset = signal<PresetId>('bigEyes');
export const facing = signal<Facing>('user');
export const camState = signal<CamState>('idle');
export const flash = signal(false);

export function camStateFromError(name: string): 'denied' | 'nocam' | 'error' {
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nocam';
  return 'error';
}
```

Run: `npx vitest run src/app/state.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Components**

`src/app/FilterStrip.tsx`:

```tsx
import { PRESETS } from '../filters/presets';
import { preset } from './state';

export function FilterStrip() {
  return (
    <nav class="strip" aria-label="filters">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          class={'chip' + (preset.value === p.id ? ' active' : '')}
          aria-label={p.id}
          aria-pressed={preset.value === p.id}
          onClick={() => (preset.value = p.id)}
        >
          {p.icon}
        </button>
      ))}
    </nav>
  );
}
```

`src/app/CaptureButton.tsx`:

```tsx
export function CaptureButton({ onCapture, onFlip }: { onCapture: () => void; onFlip: () => void }) {
  return (
    <div class="bar">
      <button class="round flip" aria-label="flip camera" onClick={onFlip}>🔄</button>
      <button class="round shutter" aria-label="take photo" onClick={onCapture} />
      <span class="round spacer" />
    </div>
  );
}
```

- [ ] **Step 5: App**

`src/app/App.tsx`:

```tsx
import { useEffect, useRef } from 'preact/hooks';
import { startCamera, stopCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesFor } from '../filters/presets';
import { snapshot } from '../capture/snapshot';
import { shareOrDownload } from '../capture/share';
import { FilterStrip } from './FilterStrip';
import { CaptureButton } from './CaptureButton';
import { preset, facing, camState, flash, camStateFromError } from './state';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FaceRenderer | null>(null);

  useEffect(() => {
    const video = videoRef.current!, canvas = canvasRef.current!;
    let faces: Face[] = [];
    let raf = 0;
    const r = new FaceRenderer(canvas, video);
    rendererRef.current = r;
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => { faces = f; }, onError: (m) => console.error('tracker', m) });
    const loop = (now: number) => {
      t.push(video, now);
      r.setHandles(handlesFor(preset.value, faces, video.videoWidth / video.videoHeight));
      r.render();
      raf = requestAnimationFrame(loop);
    };
    let started = false;
    const start = () => {
      camState.value = 'starting';
      startCamera(video, facing.value)
        .then(() => {
          camState.value = 'live';
          r.setMirror(facing.value === 'user');
          if (!started) { t.start(); started = true; raf = requestAnimationFrame(loop); }
        })
        .catch((e) => { camState.value = camStateFromError((e as DOMException)?.name ?? ''); });
    };
    start();
    const unsub = facing.subscribe(() => { if (camState.value !== 'idle') start(); });
    return () => { unsub(); cancelAnimationFrame(raf); t.stop(); r.dispose(); stopCamera(video); };
  }, []);

  const capture = async () => {
    const canvas = canvasRef.current!;
    flash.value = true;
    setTimeout(() => (flash.value = false), 120);
    const file = await snapshot(canvas);
    await shareOrDownload(file);
  };

  const retry = () => { facing.value = facing.value; camState.value = 'idle'; location.reload(); };

  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" />
      {flash.value && <div class="flash" />}
      {camState.value === 'live' && (
        <>
          <FilterStrip />
          <CaptureButton onCapture={capture} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} />
        </>
      )}
      {(camState.value === 'denied' || camState.value === 'nocam' || camState.value === 'error') && (
        <button class="blocker" onClick={retry} aria-label="retry camera">
          <span class="big">{camState.value === 'denied' ? '🔒📷' : camState.value === 'nocam' ? '🚫📷' : '⚠️📷'}</span>
          <span class="big">🔁</span>
        </button>
      )}
    </main>
  );
}
```

Note: `facing.subscribe` runs once immediately on subscribe in `@preact/signals`. The `camState !== 'idle'` guard makes that first run a no-op since `start()` already set it to `'starting'`... which is not `'idle'`. Change the guard to a `let first = true; if (first) { first = false; return; }` inside the subscribe callback. Write it that way.

- [ ] **Step 6: Styles**

Append to `src/app/styles.css`:

```css
.strip { position: absolute; left: 0; right: 0; bottom: calc(var(--tap) + 48px + env(safe-area-inset-bottom)); display: flex; gap: 12px; padding: 8px 16px; overflow-x: auto; scrollbar-width: none; }
.strip::-webkit-scrollbar { display: none; }
.chip { flex: 0 0 auto; width: var(--tap); height: var(--tap); border-radius: 50%; border: 3px solid transparent; background: rgba(0,0,0,.45); font-size: 32px; line-height: 1; display: grid; place-items: center; }
.chip.active { border-color: var(--accent); background: rgba(0,0,0,.7); }
.bar { position: absolute; left: 0; right: 0; bottom: calc(16px + env(safe-area-inset-bottom)); display: flex; justify-content: space-around; align-items: center; padding: 0 24px; }
.round { width: var(--tap); height: var(--tap); border-radius: 50%; border: none; background: rgba(0,0,0,.45); font-size: 28px; display: grid; place-items: center; }
.shutter { width: 84px; height: 84px; background: var(--fg); border: 6px solid rgba(0,0,0,.35); box-shadow: 0 0 0 4px var(--fg); }
.shutter:active { transform: scale(.92); }
.spacer { visibility: hidden; }
.flash { position: absolute; inset: 0; background: #fff; opacity: .8; pointer-events: none; }
.blocker { position: absolute; inset: 0; background: var(--bg); border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; }
.big { font-size: 72px; }
button { cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; color: inherit; }
```

- [ ] **Step 7: Manual acceptance on the phone**

Via `adb reverse` and `http://localhost:5173` on the phone:

1. Allow camera. Live view with Big Eyes active. Strip shows 7 emoji chips.
2. Tap each chip. Warp changes within one frame. `🙂` returns to plain video.
3. Tap `🔄`. Back camera, no mirror. Tap again, front, mirrored.
4. Tap the shutter. White flash. Share sheet opens. Pick WhatsApp, send to yourself. The photo shows the warp.
5. Deny camera (Chrome site settings), reload. Lock-camera icon and a retry icon. Tap retry after re-allowing: live view returns.
6. Two people in frame: both warped.

Desktop Edge: shutter downloads `facemaker-<ts>.jpg` or opens the Windows share sheet.

- [ ] **Step 8: Commit**

```bash
git add src/app/ package.json package-lock.json
git commit -m "feat: kid ui with filter strip, shutter, flip and camera error state"
```

---

### Task 11: Offline and no-egress verification, first deploy of M1

**Files:**
- Modify: `README.md` (add the verification recipe)

- [ ] **Step 1: Production build and preview on the phone**

```bash
npm run build && npm run preview
adb reverse tcp:4173 tcp:4173
```

Phone: `http://localhost:4173`. Use the app for 30 s.

- [ ] **Step 2: Offline check**

Phone: enable airplane mode. Reload the tab. Expected: app loads from the service worker, camera starts, tracking works (wasm and model served from the runtime cache). Disable airplane mode.

If the model or wasm fail offline: they were never fetched in step 1 (camera not started). Start the camera once online first.

- [ ] **Step 3: No-egress check**

Desktop Chrome: `npm run preview`, open `http://localhost:4173`, DevTools Network, clear, use the app for 2 minutes including a snapshot. Filter by domain. Expected: every request is `localhost:4173`. No `googleapis.com`. If a request to `odml.pa.googleapis.com` shows as blocked, the CSP works (it appears with status `(blocked:csp)`), and the console shows one CSP violation line. That is the expected outcome with tasks-vision 1.0.1.

- [ ] **Step 4: Lighthouse**

Desktop Chrome DevTools, Lighthouse, category Progressive Web App (or the Application panel's Manifest section in newer Chrome). Expected: installable, no manifest errors, service worker registered.

- [ ] **Step 5: Add the recipe to README**

Append to `README.md`:

```markdown
## Verify privacy (do this after every dependency change)

1. `npm run build && npm run preview`
2. Chrome DevTools, Network, clear, use the app 2 minutes with a photo.
3. Every row must be `localhost`. A `(blocked:csp)` row for `odml.pa.googleapis.com` is the MediaPipe telemetry hitting the fence. Any other third-party row is a bug.
4. Airplane mode on the phone, reload: the app must still work.
```

- [ ] **Step 6: Merge to main and deploy**

```bash
git add README.md
git commit -m "docs: privacy verification recipe"
git push -u origin HEAD
```

If work happened on a branch, open a PR and merge after the build check passes. Then:

```bash
gh run watch
```

Phone, online: open `https://face.mxa.sh`. Chrome offers Install (or use menu, Add to Home screen). Install. Open from the icon. Take a photo. Share to a friend.

- [ ] **Step 7: Tag**

```bash
git tag -a m1 -m "M1: warp + snapshot + share"
git push --tags
```

---

## Self-review notes

- Spec coverage M1: camera (T4), tracking in worker with numFaces 2 and smoothing (T5, T6), Three.js warp with six presets (T7, T8), snapshot JPEG (T9), download and share with fallback (T9), PWA manifest, icons, SW with cached wasm and model (T2), CSP fence (T2, T11), deploy with custom domain and HTTPS (T3), install check (T11). Acceptance items 1 to 7 map to T10 step 7 and T11.
- Review Focus 5 (rotation) has only a manual check in T8 step 4. The renderer's `resize()` reads the video dimensions each frame, so rotation is handled by the browser's stream re-negotiation plus `object-fit: cover`. No unit test possible without a browser.
- Not in M1 by design: gallery, video, voice, stickers, text, themes, i18n. Those are M2 and M3 plans.
- Type check: `Face`, `Handle`, `PresetId`, `FaceResult`, `WorkerIn`, `WorkerOut`, `ShareOutcome`, `CamState` are defined once and used with the same names in every task.
