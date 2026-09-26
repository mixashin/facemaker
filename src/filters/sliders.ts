import type { Face } from '../tracking/faceTracker';
import type { Handle } from './presets';

export type SliderMode = 'off' | 'size' | 'wobble' | 'swirl';
export type Region = 'nose' | 'mouth' | 'leftEye' | 'rightEye' | 'forehead' | 'chin' | 'ears';
export type SliderState = Record<Region, { mode: SliderMode; amount: number }>;

export const REGIONS: { id: Region; icon: string }[] = [
  { id: 'nose', icon: '👃' }, { id: 'mouth', icon: '👄' }, { id: 'leftEye', icon: '👁️' }, { id: 'rightEye', icon: '👁️' },
  { id: 'forehead', icon: '🧠' }, { id: 'chin', icon: '🫦' }, { id: 'ears', icon: '👂' },
];
export const MODES: { id: SliderMode; icon: string }[] = [
  { id: 'off', icon: '⭕' }, { id: 'size', icon: '↔️' }, { id: 'wobble', icon: '〰️' }, { id: 'swirl', icon: '🌀' },
];
export const DEFAULT_SLIDERS: SliderState = Object.fromEntries(REGIONS.map((r) => [r.id, { mode: 'off', amount: 0.5 }])) as SliderState;
export const WOBBLE_PERIOD_MS = 1200;

const L_CHEEK = 234, R_CHEEK = 454, TOP = 10, CHIN = 152, LIP_U = 13, LIP_L = 14, NOSE = 4;
const L_IRIS = [468, 469, 470, 471, 472], R_IRIS = [473, 474, 475, 476, 477];
type P = [number, number];
const pt = (lm: Float32Array, i: number): P => [lm[i * 3], lm[i * 3 + 1]];
function mean(lm: Float32Array, idx: number[]): P { let x = 0, y = 0; for (const i of idx) { x += lm[i * 3]; y += lm[i * 3 + 1]; } return [x / idx.length, y / idx.length]; }

// Centre(s) and radius (x units) per region.
function spots(region: Region, lm: Float32Array): { c: P; r: number }[] {
  const [lx, ly] = pt(lm, L_CHEEK), [rx, ry] = pt(lm, R_CHEEK);
  const width = Math.abs(rx - lx);
  const top = pt(lm, TOP), chin = pt(lm, CHIN), nose = pt(lm, NOSE);
  const le = mean(lm, L_IRIS), re = mean(lm, R_IRIS);
  switch (region) {
    case 'nose': return [{ c: nose, r: width * 0.2 }];
    case 'mouth': return [{ c: [(lm[LIP_U * 3] + lm[LIP_L * 3]) / 2, (lm[LIP_U * 3 + 1] + lm[LIP_L * 3 + 1]) / 2], r: width * 0.35 }];
    case 'leftEye': return [{ c: le, r: width * 0.22 }];
    case 'rightEye': return [{ c: re, r: width * 0.22 }];
    case 'forehead': return [{ c: [top[0], (top[1] + (le[1] + re[1]) / 2) / 2], r: width * 0.45 }];
    case 'chin': return [{ c: chin, r: width * 0.35 }];
    case 'ears': return [{ c: [lx - width * 0.1, ly], r: width * 0.28 }, { c: [rx + width * 0.1, ry], r: width * 0.28 }];
  }
}

function strengthFor(mode: SliderMode, amount: number, tMs: number): { strength: number; type: 0 | 1 } | null {
  switch (mode) {
    case 'off': return null;
    case 'size': return { strength: amount * 0.8, type: 0 };
    case 'wobble': return { strength: amount * 0.6 * Math.sin((2 * Math.PI * tMs) / WOBBLE_PERIOD_MS), type: 0 };
    case 'swirl': return { strength: amount * 2, type: 1 };
  }
}

export function sliderHandles(state: SliderState, faces: Face[], _aspect: number, tMs: number): Handle[] {
  const out: Handle[] = [];
  for (const f of faces) {
    for (const region of REGIONS) {
      const s = state[region.id];
      const st = strengthFor(s.mode, s.amount, tMs);
      if (!st || st.strength === 0) continue;
      for (const { c, r } of spots(region.id, f.landmarks)) out.push({ cx: c[0], cy: c[1], r, strength: st.strength, type: st.type });
    }
  }
  return out;
}
