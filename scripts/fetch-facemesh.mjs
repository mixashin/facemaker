// Builds src/render/faceMesh.json from MediaPipe's canonical face model (Apache-2.0) at a pinned commit.
// Runs by hand, never at install time: node scripts/fetch-facemesh.mjs
import { writeFileSync } from 'node:fs';

export const COMMIT = 'a908d668c730da128dfa8d9f6bd25d519d006692'; // last change of the file, 2020-09-17
export const REPO = 'https://github.com/google-ai-edge/mediapipe';
const PATH = 'mediapipe/modules/face_geometry/data/canonical_face_model.obj';

// OBJ text to one UV per vertex and the triangle list. The file indexes UVs apart from vertices (f v/vt v/vt v/vt).
export function parseObj(text) {
  const vt = [], faces = [];
  let verts = 0;
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') verts++;
    else if (p[0] === 'vt') vt.push([Number(p[1]), Number(p[2])]);
    else if (p[0] === 'f') {
      if (p.length !== 4) throw new Error('not a triangle: ' + line);
      faces.push(p.slice(1).map((c) => c.split('/').map((n) => Number(n) - 1)));
    }
  }
  const uvOf = new Array(verts).fill(-1);
  for (const f of faces) for (const [v, t] of f) {
    if (!(v >= 0 && v < verts) || !(t >= 0 && t < vt.length)) throw new Error('index out of range');
    if (uvOf[v] !== -1 && uvOf[v] !== t) throw new Error(`vertex ${v} has two UVs`);
    uvOf[v] = t;
  }
  if (uvOf.includes(-1)) throw new Error('vertex without a UV');
  return { verts, uv: uvOf.flatMap((t) => vt[t]), tri: faces.flatMap((f) => f.map(([v]) => v)) };
}

async function main() {
  const res = await fetch(`https://raw.githubusercontent.com/google-ai-edge/mediapipe/${COMMIT}/${PATH}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = parseObj(await res.text());
  if (m.verts !== 468 || m.tri.length !== 898 * 3) throw new Error(`unexpected mesh: ${m.verts} vertices, ${m.tri.length / 3} triangles`);
  writeFileSync('src/render/faceMesh.json', JSON.stringify({ source: `${REPO}/blob/${COMMIT}/${PATH}`, license: 'Apache-2.0', uv: m.uv, tri: m.tri }) + '\n');
  console.log('wrote src/render/faceMesh.json:', m.verts, 'vertices,', m.tri.length / 3, 'triangles');
}

if (import.meta.main) await main(); // Node 24; false under import (scripts/attributions.mjs, vitest)
