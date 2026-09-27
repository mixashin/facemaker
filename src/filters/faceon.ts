// Face on a picture (M4b): the live eyes and mouth on an orange, a cat, or a photo.
// Eyes and mouth are cut out of the camera picture and glued to fixed places on the target (operator,
// 2026-09-27). Where the head is, how it turns and how the face of the child is built does not move them.
// Face units: origin at the nose tip, x along the line between the cheeks, y down, 1 = face width.
import type { Handle } from './presets';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { unwarpPoint } from './warpMath';
import { coverCrop } from '../capture/snapshot';

type P = [number, number];
export type Frame = { nose: P; width: number; roll: number }; // in the camera picture. width in x units, roll in radians
// A window on the face quad, in face units. cx, cy: its place on the target, fixed. rx, ry: its size, from the
// eye or the mouth as the camera and the filters show it. ox, oy: from its place to the place of the live eye
// or mouth. The window reads the picture there.
export type Win = [number, number, number, number, number, number];
// nose and width are fractions of the picture width and height. angle: roll of the face place, radians.
// eyes, mouth: own places for eyes and mouth (see SLOTS), for a target whose face is not built like a human one.
export type Target = { id: string; icon: string; img: string; chip?: string; nose: P; width: number; angle: number; eyes?: P; mouth?: number };

const NOSE = 4, SIDE_R = 234, SIDE_L = 454, TOP = 10, CHIN = 152;
const WIDE = 0.867; // width of a face by its height (forehead to chin), seen from the front
// The face quad shows this many face widths. Eyes and mouth must stay inside with every filter on:
// a wide open mouth with big head, big mouth and a loud shout reaches 1.1 face widths below the nose.
export const SPAN = 2.4;

// A head that turns to the side looks narrow, a head that nods looks short. The larger of the two measures
// is the size of the face, so eyes and mouth keep their size on the target.
export function faceFrame(lm: Float32Array, aspect: number): Frame {
  const dx = lm[SIDE_L * 3] - lm[SIDE_R * 3], dy = (lm[SIDE_L * 3 + 1] - lm[SIDE_R * 3 + 1]) / aspect;
  const hx = lm[CHIN * 3] - lm[TOP * 3], hy = (lm[CHIN * 3 + 1] - lm[TOP * 3 + 1]) / aspect;
  return { nose: [lm[NOSE * 3], lm[NOSE * 3 + 1]], width: Math.max(Math.hypot(dx, dy), Math.hypot(hx, hy) * WIDE), roll: Math.atan2(dy, dx) };
}

export function toFace(p: P, f: Frame, aspect: number): P {
  const dx = (p[0] - f.nose[0]) / f.width, dy = (p[1] - f.nose[1]) / aspect / f.width;
  const c = Math.cos(f.roll), s = Math.sin(f.roll);
  return [c * dx + s * dy + 0, -s * dx + c * dy + 0]; // + 0: no negative zero
}

// Room around the ring (x, y), the smallest and the largest window, per window: right eye, left eye, mouth.
const ROOM: P[] = [[1.35, 2], [1.35, 2], [1.2, 1.35]];
const LEAST: P[] = [[0.1, 0.06], [0.1, 0.06], [0.16, 0.06]];
const MOST: P[] = [[0.3, 0.25], [0.3, 0.25], [0.5, 0.4]];

// Box of a ring in face units: centre and half size.
function box(ring: number[], lm: Float32Array, f: Frame, handles: Handle[], aspect: number): [number, number, number, number] {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of ring) {
    const [x, y] = toFace(unwarpPoint([lm[i * 3], lm[i * 3 + 1]], handles, aspect), f, aspect);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2];
}

// Where eyes and mouth sit on a target, in face units from its face place: right eye, left eye, mouth.
// From the proportions of a face seen from the front.
export const SLOTS: P[] = [[-0.21, -0.21], [0.21, -0.21], [0, 0.25]];
export const SWING = 0.07; // the most that eyes and mouth move to the side with a turn of the head
const TURN = 0.35; // share of the way of the nose tip that eyes and mouth follow

// The three windows that cut the face quad down to eyes and mouth. A window is pinned to its place on the
// target. It takes the size of the live eye or mouth (a mouth that opens makes a larger window), and it reads
// the camera picture where that eye or mouth is, after the filters. A turn of the head moves all three a
// little to the side, together: that keeps the face alive, and it cannot leave the orange.
export function windows(lm: Float32Array, handles: Handle[], aspect: number, place: { eyes?: P; mouth?: number } = {}): Win[] {
  const f = faceFrame(lm, aspect);
  const [ex, ey] = place.eyes ?? [SLOTS[1][0], -SLOTS[1][1]];
  const slots: P[] = [[-ex, -ey], [ex, -ey], [0, place.mouth ?? SLOTS[2][1]]];
  // The nose tip stands out of the face: when the head turns, it moves away from the middle between the cheeks
  const middle = toFace([(lm[SIDE_L * 3] + lm[SIDE_R * 3]) / 2, (lm[SIDE_L * 3 + 1] + lm[SIDE_R * 3 + 1]) / 2], f, aspect);
  const swing = Math.min(SWING, Math.max(-SWING, -middle[0] * TURN));
  return [EYE_R, EYE_L, LIPS].map((ring, n): Win => {
    const [wx, wy, hx, hy] = box(ring, lm, f, handles, aspect);
    const cx = slots[n][0] + swing, cy = slots[n][1];
    const rx = Math.min(MOST[n][0], Math.max(LEAST[n][0], hx * ROOM[n][0])), ry = Math.min(MOST[n][1], Math.max(LEAST[n][1], hy * ROOM[n][1]));
    return [cx, cy, rx, ry, wx - cx + 0, wy - cy + 0];
  });
}

// The picture covers the visible part of the stage. Result: scale of the picture group in clip space.
// One unit in that group is the picture width on both axes, so a turn there is a turn in pixels.
export function coverScale(cw: number, ch: number, ew: number, eh: number, pw: number, ph: number): P {
  const v = coverCrop(cw, ch, ew, eh);
  const k = Math.max(v.w / pw, v.h / ph); // canvas pixels per picture pixel
  return [(2 * pw * k) / cw, (2 * pw * k) / ch];
}

// The picture can slide on the screen as far as it still covers it. The face place slides toward the middle:
// a face at the side of a wide photo would be off a tall screen. Result: place of the picture group, clip space.
export function coverOffset(cw: number, ch: number, ew: number, eh: number, pw: number, ph: number, nose: P): P {
  const v = coverCrop(cw, ch, ew, eh);
  const [sx, sy] = coverScale(cw, ch, ew, eh, pw, ph);
  const ratio = ph / pw;
  const freeX = Math.max(0, sx / 2 - v.w / cw), freeY = Math.max(0, (sy * ratio) / 2 - v.h / ch);
  const x = -(nose[0] - 0.5) * sx, y = (nose[1] - 0.5) * ratio * sy;
  return [Math.min(freeX, Math.max(-freeX, x)) + 0, Math.min(freeY, Math.max(-freeY, y)) + 0];
}

const art = (id: string, icon: string, nose: P, width: number, place: { eyes?: P; mouth?: number } = {}): Target => ({ id, icon, img: `/targets/${id}.webp`, chip: `/targets/${id}-chip.webp`, nose, width, angle: 0, ...place });
// Art by Astra (CC0). The place of the face is set by hand: the face model finds human faces only.
// Animals: the nose of the child lands on the nose of the animal, and the width leaves the mouth above the chin.
// Tune with true face proportions (FACE_FIT=crop in scripts/smoke.mjs), not with the stretched test picture.
export const TARGETS: Target[] = [
  art('orange', '🍊', [0.5, 0.53], 0.42),
  art('apple', '🍎', [0.5, 0.53], 0.42),
  art('cat', '🐱', [0.497, 0.542], 0.31),
  art('dog', '🐶', [0.5, 0.5], 0.33),
  art('lion', '🦁', [0.497, 0.523], 0.31),
  art('teddy-bear', '🧸', [0.5, 0.515], 0.31),
  // The snout is as high as the nose and the upper lip of a face together: the eyes go higher and the mouth
  // lower than on a face, onto the plain skin. The mouth is low enough that it stays clear of the snout when
  // it opens wide (the window grows up and down from its place).
  art('pig', '🐷', [0.497, 0.5225], 0.36, { eyes: [0.25, 0.315], mouth: 0.36 }),
  art('potato', '🥔', [0.5, 0.51], 0.4),
  art('egg', '🥚', [0.495, 0.54], 0.34),
  art('pumpkin', '🎃', [0.5, 0.55], 0.4),
  art('toast', '🍞', [0.5, 0.52], 0.4),
  art('robot', '🤖', [0.5, 0.515], 0.4), // eyes and mouth stay inside the mint plate
  art('moon', '🌕', [0.505, 0.51], 0.36), // and inside the part of the moon that has no crater
  art('cloud', '☁️', [0.495, 0.55], 0.34),
];
export const FACEON: { id: string; icon: string; img?: string }[] = [{ id: 'none', icon: '🙂' }, ...TARGETS.map((t) => ({ id: t.id, icon: t.icon, img: t.chip })), { id: 'photo', icon: '📷' }];

// One picture at a time. A tap on the picture that is on turns it off. The photo chip does not come here: it opens the file picker.
export const pickTarget = (current: string, id: string): string => (id === current ? 'none' : id);

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
