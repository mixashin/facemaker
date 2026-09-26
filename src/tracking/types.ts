export type WorkerIn =
  | { type: 'init'; wasmPath: string; modelPath: string; numFaces: number }
  | { type: 'frame'; bitmap: ImageBitmap; ts: number };

export type FaceResult = {
  landmarks: Float32Array; // numFaces * 478 * 3, x y z normalized, faces packed in order
  count: number; // faces detected this frame
  matrices: Float32Array; // count * 16, column-major 4x4
  blend: Float32Array; // count * 52
  width: number;
  height: number;
};

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'result'; result: FaceResult; ts: number }
  | { type: 'error'; message: string };
