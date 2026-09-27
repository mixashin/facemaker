export type WorkerIn =
  | { type: 'init'; wasmPath: string; modelPath: string; numFaces: number; prefer?: 'auto' | 'GPU' | 'CPU' } // auto: the GPU first, then the CPU
  | { type: 'frame'; bitmap: ImageBitmap; ts: number }
  | { type: 'still'; bitmap: ImageBitmap; id: number }; // one picture, not a video frame (face-on mode, device photo)

export type FaceResult = {
  landmarks: Float32Array; // numFaces * 478 * 3, x y z normalized, faces packed in order
  count: number; // faces detected this frame
  blend: Float32Array; // count * 52
  width: number;
  height: number;
};

export type WorkerOut =
  | { type: 'loaded' } // model and runtime are on the device. The start limit counts from here, not from the download
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; note?: string } // note: why the CPU took over
  | { type: 'result'; result: FaceResult; ts: number }
  | { type: 'still'; id: number; landmarks: Float32Array | null } // 478 * 3 of the first face, null without a face
  | { type: 'error'; message: string };

// Person mask for the background scenes (seg.worker.ts)
export type SegIn =
  | { type: 'init'; wasmPath: string; modelPath: string }
  | { type: 'frame'; bitmap: ImageBitmap; ts: number };

export type SegOut =
  | { type: 'ready' }
  | { type: 'mask'; mask: Float32Array; width: number; height: number; ts: number } // one value per pixel: 1 is person. Row 0 is the top
  | { type: 'error'; message: string };
