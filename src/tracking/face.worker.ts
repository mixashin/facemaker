/// <reference lib="webworker" />
// Classic worker (no ES imports at runtime). MediaPipe loads its wasm via importScripts, which
// throws in module workers; the import() fallback cannot set the global ModuleFactory it then expects.
// Inline import() types only: an `import type` statement makes esbuild emit `export {}`, which a classic worker cannot parse.
type WorkerIn = import('./types').WorkerIn;
type WorkerOut = import('./types').WorkerOut;
type FaceResult = import('./types').FaceResult;

// Egress fence for this worker. The document's meta CSP does not apply to a same-origin worker script
// (workers take CSP from their own response headers, which GitHub Pages cannot set). MediaPipe 1.0.x
// posts usage telemetry to odml.pa.googleapis.com from this thread; it self-disables after the first failure.
{
  const origin = self.location.origin;
  const nativeFetch = self.fetch.bind(self);
  const blocked = (u: string) => { console.warn('blocked egress', u); return new TypeError('blocked egress ' + u); };
  self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : String(input), self.location.href);
    return u.origin === origin ? nativeFetch(input, init) : Promise.reject(blocked(u.href));
  }) as typeof fetch;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const u = new URL(String(url), self.location.href);
    if (u.origin !== origin) throw blocked(u.href);
    return (open as unknown as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}

declare const Vision: typeof import('@mediapipe/tasks-vision');
importScripts('/mediapipe/vision_bundle.js');
const { FilesetResolver, FaceLandmarker } = Vision;

let landmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null;
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
