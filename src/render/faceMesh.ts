// The face as a mesh: MediaPipe's canonical face model (Apache-2.0), built by scripts/fetch-facemesh.mjs.
import data from './faceMesh.json';

export const VERTS = 468; // the first 468 of the 478 landmarks. The last 10 are iris points, not in the mesh
export const UV = new Float32Array(data.uv); // u, v per vertex: the face unrolled flat. v grows upward
export const TRI = new Uint16Array(data.tri); // 898 triangles, counter-clockwise, no hole (eyes and mouth are covered)

// Landmarks (picture space, 0..1, y down) to clip space (-1..1, y up).
// ponytail: z stays 0 and the layer draws without a depth buffer. Back faces are culled, which hides the far
// cheek on a turned head. Give the render target a depth buffer and pass z when overlap artefacts show.
export function meshPositions(lm: Float32Array, out: Float32Array): Float32Array {
  for (let i = 0; i < VERTS; i++) {
    out[i * 3] = lm[i * 3] * 2 - 1;
    out[i * 3 + 1] = 1 - lm[i * 3 + 1] * 2;
    out[i * 3 + 2] = 0;
  }
  return out;
}
