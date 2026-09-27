// Makeup and face paint: one-tap looks (operator, 2026-09-27). A look is a list of shapes in the flat face
// layout (the UV map of the face mesh, src/render/faceMesh.ts). The painter draws them on a square canvas,
// once per look. The mesh layer (src/render/makeupLayer.ts) stretches that canvas over the live face.
import { UV } from '../render/faceMesh';
import painted from './paintLooks.json';
import costumes from './costumes.json';

// Built-in looks: none, glam, soft, rainbow, clown, zombie, vampire, tiger, butterfly, hero, cucumber.
// Looks from a picture: paint-<name> (src/filters/paintLooks.json, written by scripts/import-art.mjs).
export type LookId = string;

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
// eyes 'covered': the look paints over the eyes on purpose (the mesh keeps its eye triangles).
// flat 0..1: how much the paint ignores the light of the face. 0 keeps light and shadow, 1 is flat colour.
// img: face paint as a picture in the flat layout (art by Astra). The shapes of the look are painted over it.
// chip: small picture for the chip.
export type Look = { id: LookId; icon: string; smooth: number; layers: Layer[]; eyes?: 'covered'; flat?: number; img?: string; chip?: string };

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

// Eyes and mouth need no care here: the mesh has holes there (makeupLayer.ts), so paint on those places
// of the layout is never drawn. The closed mouth is a line of 1.5 px in the layout: an erase could not hit it.
// picture: the loaded picture of a look with `img`. While it is on its way, the canvas stays empty.
export function paintLook(g: G, look: Look, size: number, picture?: CanvasImageSource): void {
  g.clearRect(0, 0, size, size);
  if (look.img && !picture) return;
  if (picture) g.drawImage(picture, 0, 0, size, size);
  paint(g, look.layers, size);
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
const skin = (color: string, alpha: number): Layer => ({ kind: 'fill', ring: OVAL, grow: 0.97, color, alpha, blur: 0.012 });
const dots = (at: [number, number][], r: number, color: string, alpha = 1): Layer[] => at.map((p) => ({ kind: 'blob', at: [p], r, hard: true, color, alpha, mirror: true }));
const stripe = (ring: [number, number][], mirror = true): Layer => ({ kind: 'fill', ring, color: '#151515', alpha: 0.95, mirror });
// Part of a circle as a path. Angles in degrees: 0 is to the right, 90 is up.
const arc = (cx: number, cy: number, r: number, from: number, to: number): Pt[] =>
  Array.from({ length: 21 }, (_, i): Pt => { const a = ((from + ((to - from) * i) / 20) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; });
// The bow on the forehead, red outside. A cloud at each end hides where the bands stop.
const BOW: Layer[] = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#1e90ff', '#af52de'].map((color, i): Layer => ({ kind: 'stroke', path: arc(0.5, 0.36, 0.236 - i * 0.017, 40, 140), width: 0.0175, color, alpha: 0.92 }));
const CLOUD: Layer[] = [...dots([[0.315, 0.24], [0.39, 0.262]], 0.036, '#ffffff'), ...dots([[0.35, 0.228]], 0.044, '#ffffff')];
// A sparkle: a star with four points, on both cheeks
const star = (x: number, y: number, r: number, color: string): Layer =>
  ({ kind: 'fill', ring: Array.from({ length: 8 }, (_, i): Pt => { const k = i % 2 ? r * 0.32 : r; return [x + k * Math.sin((i * Math.PI) / 4), y - k * Math.cos((i * Math.PI) / 4)]; }), color, alpha: 1, mirror: true });
const WING_UP: [number, number][] = [[0.47, 0.37], [0.42, 0.24], [0.26, 0.15], [0.09, 0.22], [0.05, 0.38], [0.18, 0.44], [0.4, 0.42]];
const WING_DOWN: [number, number][] = [[0.46, 0.43], [0.3, 0.45], [0.12, 0.5], [0.11, 0.63], [0.25, 0.68], [0.4, 0.58]];
const wing = (ring: [number, number][], color: string, grow = 1): Layer => ({ kind: 'fill', ring, grow, round: true, color, alpha: 0.9, mirror: true });
const slice = (eye: number[]): Layer[] => [
  { kind: 'blob', at: eye, r: 0.104, hard: true, color: '#2f7a22', alpha: 1 },
  { kind: 'blob', at: eye, r: 0.088, hard: true, color: '#a9d86a', alpha: 1 },
  { kind: 'blob', at: eye, r: 0.062, hard: true, color: '#c4e68c', alpha: 1 },
  { kind: 'blob', at: eye, r: 0.022, hard: true, color: '#8cc653', alpha: 1 },
  ...Array.from({ length: 8 }, (_, i): Layer => ({ kind: 'blob', at: eye, r: 0.011, hard: true, color: '#5f9e35', alpha: 1, dx: 0.04 * Math.cos((i * Math.PI) / 4), dy: 0.04 * Math.sin((i * Math.PI) / 4) })),
];

const BUILT_IN: Look[] = [
  { id: 'none', icon: '🙂', smooth: 0, layers: [] },
  { id: 'glam', icon: '💄', smooth: 0.6, layers: [...shadow('#8a4fb0', 0.45), ...liner(), lips('#c4122f', 0.8), ...blush('#ff5a8a', 0.32)] },
  { id: 'soft', icon: '🌸', smooth: 0.7, layers: [...shadow('#c9a0dc', 0.22), lips('#e0607e', 0.5), ...blush('#ff8fa3', 0.28)] },
  { id: 'rainbow', icon: '🌈', smooth: 0.4, layers: [
    ...shadow('#4aa8ff', 0.6, [1.5, 3.6], -0.03), ...shadow('#57d66b', 0.6, [1.4, 2.9], -0.022), ...shadow('#ffd23f', 0.65, [1.3, 2.2], -0.014), ...shadow('#ff5ac8', 0.65, [1.2, 1.6], -0.006),
    ...BOW, ...CLOUD,
    lips('#b14aff', 0.75), ...blush('#ff7ad9', 0.3), star(0.25, 0.5, 0.03, '#ffe14a'), star(0.31, 0.56, 0.02, '#ffe14a'), star(0.22, 0.58, 0.016, '#ffffff'),
  ] },
  { id: 'clown', icon: '🤡', smooth: 0, layers: [
    skin('#ffffff', 0.88),
    // the mouth: a wide smile, the corners go up
    { kind: 'fill', round: true, color: '#e0101a', alpha: 0.95, blur: 0.003, ring: [[0.3, 0.6], [0.37, 0.64], [0.44, 0.628], [0.5, 0.636], [0.56, 0.628], [0.63, 0.64], [0.7, 0.6], [0.67, 0.73], [0.59, 0.79], [0.5, 0.805], [0.41, 0.79], [0.33, 0.73]] },
    { kind: 'blob', at: [4], r: 0.07, hard: true, color: '#e0101a', alpha: 1 },
    { kind: 'fill', ring: [[0.3, 0.335], [0.392, 0.335], [0.346, 0.215]], color: '#1e6bff', alpha: 0.92, mirror: true },
    { kind: 'fill', ring: [[0.305, 0.425], [0.387, 0.425], [0.346, 0.52]], color: '#1e6bff', alpha: 0.92, mirror: true },
    ...dots([[0.25, 0.545]], 0.05, '#ff4f7b', 0.85),
  ] },
  { id: 'zombie', icon: '🧟', smooth: 0, layers: [
    skin('#8fae62', 0.66), ...shadow('#2b1030', 0.7, [1.5, 3.2], 0), lips('#3b2a3d', 0.85),
    { kind: 'blob', at: [[0.27, 0.66]], r: 0.06, color: '#4c6a34', alpha: 0.75 }, { kind: 'blob', at: [[0.74, 0.6]], r: 0.05, color: '#4c6a34', alpha: 0.75 }, { kind: 'blob', at: [[0.37, 0.17]], r: 0.05, color: '#4c6a34', alpha: 0.75 },
    // a seam with three stitches: thread, not a wound
    { kind: 'stroke', path: [[0.6, 0.17], [0.66, 0.22], [0.71, 0.3]], width: 0.008, color: '#2b2b2b', alpha: 0.9 },
    ...([[[0.615, 0.2], [0.645, 0.175]], [[0.655, 0.245], [0.69, 0.22]], [[0.685, 0.3], [0.72, 0.275]]] as [number, number][][]).map((path): Layer => ({ kind: 'stroke', path, width: 0.006, color: '#2b2b2b', alpha: 0.9 })),
  ] },
  { id: 'vampire', icon: '🧛', smooth: 0.5, layers: [
    skin('#eceaf5', 0.55), ...shadow('#3a0d24', 0.6, [1.35, 3], -0.01), ...liner(), lips('#6e0014', 0.9),
    { kind: 'fill', ring: [[0.452, 0.69], [0.486, 0.69], [0.469, 0.748]], color: '#ffffff', alpha: 0.97, mirror: true }, // fangs, over the lower lip
  ] },
  { id: 'tiger', icon: '🐯', smooth: 0, layers: [
    skin('#ff8a1e', 0.88),
    { kind: 'blob', at: [[0.5, 0.71]], r: 0.125, sx: 1.35, hard: true, blur: 0.025, color: '#ffffff', alpha: 0.95 },
    { kind: 'blob', at: [[0.346, 0.3]], r: 0.08, color: '#ffffff', alpha: 0.8, mirror: true },
    { kind: 'blob', at: [4], r: 0.042, sx: 1.4, hard: true, color: '#151515', alpha: 0.95 },
    { kind: 'stroke', path: [2, 0], width: 0.008, color: '#151515', alpha: 0.9 },
    stripe([[0.478, 0.115], [0.522, 0.115], [0.5, 0.26]], false), stripe([[0.4, 0.12], [0.445, 0.115], [0.44, 0.25]]), stripe([[0.29, 0.15], [0.335, 0.135], [0.36, 0.27]]),
    stripe([[0.03, 0.455], [0.04, 0.53], [0.31, 0.5]]), stripe([[0.06, 0.585], [0.08, 0.66], [0.32, 0.6]]), stripe([[0.13, 0.725], [0.17, 0.795], [0.33, 0.705]]),
    ...dots([[0.4, 0.64], [0.43, 0.655], [0.41, 0.672]], 0.007, '#151515'),
  ] },
  { id: 'butterfly', icon: '🦋', smooth: 0.3, layers: [
    wing(WING_UP, '#7b2ff7'), wing(WING_DOWN, '#7b2ff7'), wing(WING_UP, '#ff5ac8', 0.72), wing(WING_DOWN, '#ff5ac8', 0.68),
    ...dots([[0.15, 0.3], [0.2, 0.57]], 0.022, '#ffe14a'), ...dots([[0.28, 0.22], [0.1, 0.37]], 0.012, '#ffffff'),
    { kind: 'stroke', path: [168, 6, 197, 195, 5], width: 0.022, color: '#2a1a3a', alpha: 0.95 },
    { kind: 'stroke', path: [[0.49, 0.33], [0.455, 0.22], [0.4, 0.155]], width: 0.006, color: '#2a1a3a', alpha: 0.95, mirror: true },
    ...dots([[0.4, 0.155]], 0.012, '#2a1a3a'),
  ] },
  { id: 'hero', icon: '🦸', smooth: 0.3, layers: [
    { kind: 'fill', round: true, color: '#d4121f', alpha: 0.96, ring: [[0.05, 0.37], [0.1, 0.27], [0.3, 0.235], [0.44, 0.275], [0.5, 0.305], [0.56, 0.275], [0.7, 0.235], [0.9, 0.27], [0.95, 0.37], [0.9, 0.455], [0.72, 0.49], [0.57, 0.455], [0.5, 0.42], [0.43, 0.455], [0.28, 0.49], [0.1, 0.455]] },
    ...shadow('#8a0a12', 0.9, [1.35, 1.9], 0),
  ] },
  { id: 'cucumber', icon: '🥒', smooth: 0.5, eyes: 'covered', flat: 0.85, layers: [
    skin('#b5dd95', 0.85), { kind: 'erase', ring: LIPS, grow: 1.12, blur: 0.006 }, ...slice(EYE_R), ...slice(EYE_L),
  ] },
];

// The paint of a costume keeps its colour (flat): the 3D nose of the witch has the colour of the paint around it
const WORN = new Set((costumes as { look: string }[]).map((c) => c.look));
const PAINTED: Look[] = (painted as { id: string; icon: string; img: string; chip: string }[]).map((p) => ({ ...p, smooth: 0, layers: [], ...(WORN.has(p.id) ? { flat: 0.85 } : {}) }));
export const LOOKS: Look[] = [...BUILT_IN, ...PAINTED];

// The chips: none, the painted looks, then the drawn looks. A drawn look is not in the list while its
// painted twin is there (its code stays: take the line out of TWINS to show both).
const TWINS: Record<string, string> = { tiger: 'paint-tiger', butterfly: 'paint-butterfly', clown: 'paint-clown', rainbow: 'paint-rainbow', hero: 'paint-superhero-mask' };
export function makeupChips(painted: Look[]): { id: LookId; icon: string; img?: string }[] {
  const there = new Set(painted.map((p) => p.id));
  return [BUILT_IN[0], ...painted, ...BUILT_IN.slice(1).filter((l) => !there.has(TWINS[l.id]))].map(({ id, icon, chip }) => ({ id, icon, img: chip }));
}
export const MAKEUP = makeupChips(PAINTED);
const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
export const lookById = (id: LookId): Look => BY_ID.get(id) ?? LOOKS[0];

// One look at a time. A tap on the look that is on turns it off.
export const pickLook = (current: LookId, id: LookId): LookId => (id === current ? 'none' : id);
