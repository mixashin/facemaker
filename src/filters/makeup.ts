// Makeup and face paint: one-tap looks (operator, 2026-09-27). A look is a list of shapes in the flat face
// layout (the UV map of the face mesh, src/render/faceMesh.ts). The painter draws them on a square canvas,
// once per look. The mesh layer (src/render/makeupLayer.ts) stretches that canvas over the live face.
import { UV } from '../render/faceMesh';

export type LookId = 'none' | 'glam' | 'soft' | 'rainbow' | 'clown' | 'zombie' | 'vampire' | 'tiger' | 'butterfly' | 'hero' | 'cucumber';

// Landmark rings (MediaPipe face mesh), in drawing order. R is the subject's right: the left of the camera picture.
export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const MOUTH = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]; // the opening
export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LID_R = [33, 246, 161, 160, 159, 158, 157, 173, 133]; // upper lid, outer to inner corner
const LID_L = [263, 466, 388, 387, 386, 385, 384, 398, 362];

// A point is a landmark, or a place in the layout: [x, y], 0..1, y down.
export type Pt = number | [number, number];
type Grow = number | [number, number];
type Paint = { color: string; alpha: number; blur?: number; mirror?: boolean };
type Fill = Paint & { kind: 'fill'; ring: Pt[]; grow?: Grow; dy?: number; round?: boolean };
type Blob = Paint & { kind: 'blob'; at: Pt[]; r: number; hard?: boolean; dx?: number; dy?: number; sx?: number };
type Stroke = Paint & { kind: 'stroke'; path: Pt[]; width: number };
type Erase = { kind: 'erase'; ring: Pt[]; grow?: Grow; blur?: number };
export type Layer = Fill | Blob | Stroke | Erase;
// Lengths in a layer (r, blur, width, dx, dy) are fractions of the layout size.
export type Look = { id: LookId; icon: string; smooth: number; layers: Layer[]; eyes?: 'covered' };

export function toLayout(p: Pt): [number, number] {
  return typeof p === 'number' ? [UV[p * 2], 1 - UV[p * 2 + 1]] : p;
}
function centre(ps: Pt[]): [number, number] {
  let x = 0, y = 0;
  for (const p of ps) { const q = toLayout(p); x += q[0]; y += q[1]; }
  return [x / ps.length, y / ps.length];
}
// A ring scaled about its centre (one factor, or x and y apart) and moved down by dy.
export function grown(ring: Pt[], k: Grow = 1, dy = 0): [number, number][] {
  const [kx, ky] = typeof k === 'number' ? [k, k] : k;
  const [cx, cy] = centre(ring);
  return ring.map((p) => { const [x, y] = toLayout(p); return [cx + (x - cx) * kx, cy + (y - cy) * ky + dy]; });
}

type G = CanvasRenderingContext2D;
function trace(g: G, ps: [number, number][], size: number, round: boolean, close: boolean): void {
  if (round && close) {
    // A smooth closed curve: from the middle of one edge, around the corner, to the middle of the next edge.
    const mid = (a: [number, number], b: [number, number]) => [((a[0] + b[0]) / 2) * size, ((a[1] + b[1]) / 2) * size];
    const s = mid(ps[ps.length - 1], ps[0]);
    g.moveTo(s[0], s[1]);
    ps.forEach((p, i) => { const m = mid(p, ps[(i + 1) % ps.length]); g.quadraticCurveTo(p[0] * size, p[1] * size, m[0], m[1]); });
  } else ps.forEach(([x, y], i) => (i ? g.lineTo(x * size, y * size) : g.moveTo(x * size, y * size)));
  if (close) g.closePath();
}

function draw(g: G, l: Layer, size: number): void {
  g.beginPath();
  if (l.kind === 'erase') {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000000';
    trace(g, grown(l.ring, l.grow), size, false, true);
    g.fill();
    return;
  }
  g.globalAlpha = l.alpha;
  g.fillStyle = l.color;
  g.strokeStyle = l.color;
  if (l.kind === 'fill') {
    trace(g, grown(l.ring, l.grow, l.dy), size, !!l.round, true);
    g.fill();
  } else if (l.kind === 'blob') {
    const [cx, cy] = centre(l.at);
    const r = l.r * size;
    g.translate((cx + (l.dx ?? 0)) * size, (cy + (l.dy ?? 0)) * size);
    g.scale(l.sx ?? 1, 1);
    if (!l.hard) {
      const soft = g.createRadialGradient(0, 0, 0, 0, 0, r);
      soft.addColorStop(0, l.color);
      soft.addColorStop(1, l.color + '00');
      g.fillStyle = soft;
    }
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  } else {
    g.lineWidth = l.width * size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    trace(g, l.path.map(toLayout), size, false, false);
    g.stroke();
  }
}

function paint(g: G, layers: Layer[], size: number): void {
  for (const l of layers) {
    const sides = l.kind !== 'erase' && l.mirror ? [false, true] : [false];
    for (const flip of sides) {
      g.save(); // alpha, filter, transform and blend mode go back with restore
      g.filter = l.blur ? `blur(${(l.blur * size).toFixed(1)}px)` : 'none';
      if (flip) { g.translate(size, 0); g.scale(-1, 1); }
      draw(g, l, size);
      g.restore();
    }
  }
}

// The mesh has no hole: triangles cover the eyeballs and the inside of the mouth. Paint there would sit on
// teeth and eyes, so these go last and erase. The closed mouth is a thin line in the layout.
const OPEN_MOUTH: Erase = { kind: 'erase', ring: MOUTH, grow: [1.02, 3], blur: 0.003 };
const OPEN_EYES: Erase[] = [EYE_R, EYE_L].map((ring): Erase => ({ kind: 'erase', ring, grow: 1.12, blur: 0.004 }));

export function paintLook(g: G, look: Look, size: number): void {
  g.clearRect(0, 0, size, size);
  if (look.layers.length === 0) return;
  paint(g, [...look.layers, OPEN_MOUTH, ...(look.eyes === 'covered' ? [] : OPEN_EYES)], size);
}

// Where the skin is smoothed: the face, without eyes, brows and lips. The alpha channel is the mask.
export function paintSkin(g: G, size: number): void {
  g.clearRect(0, 0, size, size);
  paint(g, [
    { kind: 'fill', ring: OVAL, grow: 0.94, color: '#ffffff', alpha: 1, blur: 0.02 },
    ...[EYE_R, EYE_L].map((ring): Erase => ({ kind: 'erase', ring, grow: [1.3, 2.2], blur: 0.01 })),
    ...[BROW_R, BROW_L].map((ring): Erase => ({ kind: 'erase', ring, grow: 1.15, blur: 0.01 })),
    { kind: 'erase', ring: LIPS, grow: 1.1, blur: 0.008 },
  ], size);
}

// Parts that several looks share
const lips = (color: string, alpha: number): Layer => ({ kind: 'fill', ring: LIPS, color, alpha, blur: 0.004 });
const blush = (color: string, alpha: number, r = 0.11): Layer[] => [50, 280].map((i): Layer => ({ kind: 'blob', at: [i], r, color, alpha }));
const shadow = (color: string, alpha: number, grow: Grow = [1.3, 2.6], dy = -0.02): Layer[] =>
  [EYE_R, EYE_L].map((ring): Layer => ({ kind: 'fill', ring, grow, dy, color, alpha, blur: 0.015 }));
const liner = (color = '#1a1a1a'): Layer[] =>
  [[[0.262, 0.362] as Pt, ...LID_R], [[0.738, 0.362] as Pt, ...LID_L]].map((path): Layer => ({ kind: 'stroke', path, width: 0.007, color, alpha: 0.85 }));

export const LOOKS: Look[] = [
  { id: 'none', icon: '🙂', smooth: 0, layers: [] },
  { id: 'glam', icon: '💄', smooth: 0.6, layers: [...shadow('#8a4fb0', 0.45), ...liner(), lips('#c4122f', 0.8), ...blush('#ff5a8a', 0.32)] },
  { id: 'soft', icon: '🌸', smooth: 0.7, layers: [...shadow('#c9a0dc', 0.22), lips('#e0607e', 0.5), ...blush('#ff8fa3', 0.28)] },
];

export const MAKEUP = LOOKS.map(({ id, icon }) => ({ id, icon }));
const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
export const lookById = (id: LookId): Look => BY_ID.get(id) ?? LOOKS[0];

// One look at a time. A tap on the look that is on turns it off.
export const pickLook = (current: LookId, id: LookId): LookId => (id === current ? 'none' : id);
