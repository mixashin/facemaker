/// <reference lib="webworker" />
// Person mask for the background scenes (M4c). Classic worker, same rules as face.worker.ts:
// no ES imports at runtime, inline import() types only.
type SegIn = import('./types').SegIn;
type SegOut = import('./types').SegOut;

// Egress fence for this worker, the same as in face.worker.ts (a test compares the two). The document's
// meta CSP does not apply to a same-origin worker script, and MediaPipe posts usage telemetry from here.
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
importScripts(`/mediapipe/${__MP_VER__}/vision_bundle.js`);
const { FilesetResolver, ImageSegmenter } = Vision;

let seg: import('@mediapipe/tasks-vision').ImageSegmenter | null = null;

const post = (m: SegOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function init(wasmPath: string, modelPath: string) {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  // CPU on purpose: the mask is needed as bytes (no read-back from the GPU), the face tracker keeps the GPU,
  // and the GPU path of the segmenter leaks memory in tasks-vision 1.0.1 (research/02).
  seg = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  post({ type: 'ready' });
}

function frame(bitmap: ImageBitmap, ts: number) {
  if (!seg) { bitmap.close(); post({ type: 'error', message: 'not ready' }); return; }
  let sent = false;
  try {
    seg.segmentForVideo(bitmap, ts, (r) => {
      const m = r.confidenceMasks?.[0]; // one mask: 1 is person, 0 is background
      if (!m) return;
      const f = m.getAsFloat32Array(); // lives only inside this callback
      const mask = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) mask[i] = f[i] * 255;
      post({ type: 'mask', mask, width: m.width, height: m.height, ts }, [mask.buffer]);
      sent = true;
    });
  } finally {
    bitmap.close();
  }
  if (!sent) post({ type: 'error', message: 'no mask' }); // the tracker waits for an answer to every frame
}

self.onmessage = (e: MessageEvent<SegIn>) => {
  const m = e.data;
  if (m.type === 'init') init(m.wasmPath, m.modelPath).catch((err) => post({ type: 'error', message: String(err?.message ?? err) }));
  else if (m.type === 'frame') {
    try { frame(m.bitmap, m.ts); } catch (err) { post({ type: 'error', message: String((err as Error)?.message ?? err) }); }
  }
};
