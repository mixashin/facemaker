import type { Face } from '../tracking/faceTracker';

export type HandleType = 0 | 1 | 2; // 0 scale, 1 swirl, 2 flip (constant rotation, feathered rim)
export type Handle = { cx: number; cy: number; r: number; strength: number; type: HandleType };
export type PresetId =
  | 'none' | 'bigEyes' | 'bigMouth' | 'bigHead' | 'smallFace' | 'bulge' | 'swirl'
  | 'noNose' | 'bigEars' | 'doubleChin' | 'fatFace' | 'upsideDown';

export const PRESETS: { id: PresetId; icon: string }[] = [
  { id: 'none', icon: '🙂' },
  { id: 'bigEyes', icon: '👀' },
  { id: 'bigMouth', icon: '👄' },
  { id: 'bigHead', icon: '🎈' },
  { id: 'smallFace', icon: '🤏' },
  { id: 'bulge', icon: '🔍' },
  { id: 'swirl', icon: '🌀' },
  { id: 'noNose', icon: '👃' },
  { id: 'bigEars', icon: '👂' },
  { id: 'doubleChin', icon: '🍩' },
  { id: 'fatFace', icon: '🎃' },
  { id: 'upsideDown', icon: '🙃' },
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

function faceHandles(preset: PresetId, lm: Float32Array, aspect: number): Handle[] {
  const [lx] = pt(lm, L_CHEEK), [rx] = pt(lm, R_CHEEK);
  const width = Math.abs(rx - lx);
  const [cx, cy] = pt(lm, NOSE);
  const [, ty] = pt(lm, TOP), [, by] = pt(lm, CHIN);
  const height = Math.abs(by - ty);
  const heightX = height / aspect; // face height in x units, for radii
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
      return [{ cx, cy: (ty + by) / 2, r: Math.max(width, heightX) * 0.95, strength: 0.4, type: 0 }];
    case 'smallFace':
      return [{ cx, cy, r: Math.max(width, heightX) * 0.8, strength: -0.45, type: 0 }];
    case 'bulge':
      return [{ cx, cy, r: width * 0.5, strength: 0.7, type: 0 }];
    case 'swirl':
      return [{ cx, cy, r: width * 0.6, strength: 1.2, type: 1 }];
    case 'noNose':
      return [{ cx, cy, r: width * 0.18, strength: -0.9, type: 0 }];
    case 'bigEars': {
      const [, ly] = pt(lm, L_CHEEK), [, ry] = pt(lm, R_CHEEK);
      return [
        { cx: lx - width * 0.1, cy: ly, r: width * 0.28, strength: 0.7, type: 0 },
        { cx: rx + width * 0.1, cy: ry, r: width * 0.28, strength: 0.7, type: 0 },
      ];
    }
    case 'doubleChin': {
      const [chx, chy] = pt(lm, CHIN);
      return [{ cx: chx, cy: chy + height * 0.12, r: width * 0.45, strength: 0.55, type: 0 }];
    }
    case 'fatFace': {
      const [, ly] = pt(lm, L_CHEEK), [, ry] = pt(lm, R_CHEEK);
      return [
        { cx: lx + width * 0.05, cy: ly, r: width * 0.35, strength: 0.5, type: 0 },
        { cx: rx - width * 0.05, cy: ry, r: width * 0.35, strength: 0.5, type: 0 },
        { cx, cy: by - height * 0.05, r: width * 0.4, strength: 0.45, type: 0 },
      ];
    }
    case 'upsideDown':
      return [{ cx, cy: (ty + by) / 2, r: Math.max(width, heightX) * 0.62, strength: Math.PI, type: 2 }];
    default:
      return [];
  }
}

export function handlesFor(preset: PresetId, faces: Face[], aspect: number): Handle[] {
  if (preset === 'none' || faces.length === 0) return [];
  return faces.flatMap((f) => faceHandles(preset, f.landmarks, aspect));
}
