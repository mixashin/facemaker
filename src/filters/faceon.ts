// Face on a picture (M4b): the live eyes and mouth on an orange, a cat, or a photo.
// Face units: origin at the nose tip, x along the line between the cheeks, y down, 1 = face width.
import type { Handle } from './presets';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { unwarpPoint } from './warpMath';
import { coverCrop } from '../capture/snapshot';

type P = [number, number];
export type Frame = { nose: P; width: number; roll: number }; // in the camera picture. width in x units, roll in radians
export type Win = [number, number, number, number]; // cx, cy, rx, ry in face units
// nose and width are fractions of the picture width and height. angle: roll of the face place, radians.
export type Target = { id: string; icon: string; img: string; chip?: string; nose: P; width: number; angle: number };

const NOSE = 4, SIDE_R = 234, SIDE_L = 454;
export const SPAN = 1.6; // the face quad shows this many face widths

export function faceFrame(lm: Float32Array, aspect: number): Frame {
  const dx = lm[SIDE_L * 3] - lm[SIDE_R * 3], dy = (lm[SIDE_L * 3 + 1] - lm[SIDE_R * 3 + 1]) / aspect;
  return { nose: [lm[NOSE * 3], lm[NOSE * 3 + 1]], width: Math.hypot(dx, dy), roll: Math.atan2(dy, dx) };
}

export function toFace(p: P, f: Frame, aspect: number): P {
  const dx = (p[0] - f.nose[0]) / f.width, dy = (p[1] - f.nose[1]) / aspect / f.width;
  const c = Math.cos(f.roll), s = Math.sin(f.roll);
  return [c * dx + s * dy + 0, -s * dx + c * dy + 0]; // + 0: no negative zero
}

// Room around the ring (x, y) and the smallest window, per window: right eye, left eye, mouth.
const ROOM: P[] = [[1.35, 2], [1.35, 2], [1.2, 1.35]];
const LEAST: P[] = [[0.1, 0.06], [0.1, 0.06], [0.16, 0.06]];

// Where eyes and mouth show after the filters, in face units. The shader cuts the face quad down to these.
export function windows(lm: Float32Array, handles: Handle[], aspect: number): Win[] {
  const f = faceFrame(lm, aspect);
  return [EYE_R, EYE_L, LIPS].map((ring, n): Win => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of ring) {
      const [x, y] = toFace(unwarpPoint([lm[i * 3], lm[i * 3 + 1]], handles, aspect), f, aspect);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(LEAST[n][0], ((x1 - x0) / 2) * ROOM[n][0]), Math.max(LEAST[n][1], ((y1 - y0) / 2) * ROOM[n][1])];
  });
}

// The picture covers the visible part of the stage. Result: scale of the picture group in clip space.
// One unit in that group is the picture width on both axes, so a turn there is a turn in pixels.
export function coverScale(cw: number, ch: number, ew: number, eh: number, pw: number, ph: number): P {
  const v = coverCrop(cw, ch, ew, eh);
  const k = Math.max(v.w / pw, v.h / ph); // canvas pixels per picture pixel
  return [(2 * pw * k) / cw, (2 * pw * k) / ch];
}

const art = (id: string, icon: string, nose: P, width: number): Target => ({ id, icon, img: `/targets/${id}.webp`, chip: `/targets/${id}-chip.webp`, nose, width, angle: 0 });
// Art by Astra (CC0). The place of the face is set by hand: the face model finds human faces only.
export const TARGETS: Target[] = [
  art('orange', '🍊', [0.5, 0.53], 0.42),
  art('apple', '🍎', [0.5, 0.53], 0.42),
  art('cat', '🐱', [0.497, 0.542], 0.4),
  art('dog', '🐶', [0.5, 0.5], 0.4),
  art('lion', '🦁', [0.497, 0.523], 0.4),
];
export const FACEON: { id: string; icon: string; img?: string }[] = [{ id: 'none', icon: '🙂' }, ...TARGETS.map((t) => ({ id: t.id, icon: t.icon, img: t.chip })), { id: 'photo', icon: '📷' }];

export const pickTarget = (current: string, id: string): string => (id === current && id !== 'photo' ? 'none' : id);

// A photo from the device. With a face in it, the live eyes and mouth go on that face.
export function photoTarget(img: string, lm: Float32Array | null, pw: number, ph: number): Target {
  if (!lm) return { id: 'photo', icon: '📷', img, nose: [0.5, 0.5], width: 0.4, angle: 0 };
  const f = faceFrame(lm, pw / ph);
  return { id: 'photo', icon: '📷', img, nose: f.nose, width: f.width, angle: f.roll };
}

export function fitSize(w: number, h: number, max = 1536): P {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}
