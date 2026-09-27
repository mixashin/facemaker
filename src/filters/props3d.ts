// 3D props (operator, 2026-09-27): hats and glasses that sit on the head and turn with it, pests that fly
// around it. Models by Astra (CC0, brief R5), imported by scripts/import-art.mjs props3d.
//
// Place, size and turn come from the landmarks. The tracker gives no pose matrix: the step of MediaPipe that
// makes it stops the whole tracker on a face with bad numbers (found 2026-09-27 on a phone). Before that, a
// prop placed by the matrix alone missed the face by 9 to 36 px on a 640 px picture anyway.
//
// Stage space: x right, y up, z toward the viewer, no perspective. One unit is half the picture width.
// Depth (measured on a real face, in face widths): the zero of the landmarks is on the skin of the face,
// not in the middle of the head. Forehead +0.08, bridge of the nose +0.10, nose tip +0.28, sides of the
// face -0.50. The sides are the middle of the head in depth.
// The picture is not mirrored here: the warp pass mirrors it with everything on it.
import * as THREE from 'three';
import list from './props3d.json';
import { faceFrame } from './faceon';
import type { Face } from '../tracking/faceTracker';

type V3 = [number, number, number];
export type Kind = 'hat' | 'glasses' | 'pest';
// Worn props: the anchor is the mean of the landmarks `at`. `offset` goes from there, in face widths, in the
// frame of the head (x to the left cheek of the picture, y up, z out of the face). `scale`: largest side of the
// prop in face widths.
type Worn = { kind: 'hat' | 'glasses'; at: number[]; offset: V3; scale: number; clip?: undefined };
// Pests. orbit: around the head, radius and height in face widths, one round in `period` seconds.
// hang: beside the head, on a thread. crawl: on the face, around the landmark `at`.
type Pest = { kind: 'pest'; path: 'orbit' | 'hang' | 'crawl'; radius: number; height: number; period: number; scale: number; clip: string; at?: number };
type Rule = Worn | Pest;
type Facts = { id: string; triangles: number; size: number[]; centre: number[]; clips: string[] };
export type Prop3D = Rule & { id: string; icon: string; file: string; chip: string; clips: string[] };

const FOREHEAD = 10, CHIN = 152, BRIDGE = 168, BROW = 151, SIDE_R = 234, SIDE_L = 454;
const hat = (scale: number, up: number, back = -0.55): Worn => ({ kind: 'hat', at: [FOREHEAD], offset: [0, up, back], scale });
const orbit = (radius: number, height: number, period: number, scale: number, clip = 'fly'): Pest => ({ kind: 'pest', path: 'orbit', radius, height, period, scale, clip });
// Order of the chips: what a child wears first, then what flies and crawls.
const RULES: [string, string, Rule][] = [
  ['party-hat', '🥳', hat(0.95, 0.17)],
  ['pirate-hat', '🏴‍☠️', hat(1.6, 0.04)],
  ['crown', '👑', hat(0.95, 0.08)],
  ['witch-hat', '🧙', hat(1.7, 0.04)],
  ['sunglasses', '🕶️', { kind: 'glasses', at: [BRIDGE], offset: [0, -0.02, 0.05], scale: 1.02 }],
  ['bee', '🐝', orbit(0.85, 0.2, 5, 0.24)],
  ['fly', '🪰', orbit(0.8, 0.42, 3.6, 0.2)],
  ['mosquito', '🦟', orbit(0.9, -0.05, 2.9, 0.22)],
  ['butterfly', '🦋', orbit(0.95, 0.6, 8, 0.32, 'flap')],
  ['ladybug', '🐞', { kind: 'pest', path: 'crawl', radius: 0.08, height: 0.03, period: 6, scale: 0.17, clip: 'walk', at: BROW }],
  ['spider', '🕷️', { kind: 'pest', path: 'hang', radius: 0.8, height: 0.3, period: 3.2, scale: 0.34, clip: 'idle' }],
];
const FACTS = new Map((list as Facts[]).map((f) => [f.id, f]));
export const PROPS3D: Prop3D[] = RULES.filter(([id]) => FACTS.has(id)).map(([id, icon, rule]) => ({ ...rule, id, icon, file: `/props3d/${id}.glb`, chip: `/props3d/${id}-chip.webp`, clips: FACTS.get(id)!.clips }));
export const PROPS3D_CHIPS: { id: string; icon: string; img?: string }[] = [{ id: 'none', icon: '🙂' }, ...PROPS3D.map((p) => ({ id: p.id, icon: p.icon, img: p.chip }))];
const BY_ID = new Map(PROPS3D.map((p) => [p.id, p]));
export const prop3dById = (id: string): Prop3D | undefined => BY_ID.get(id);

// One hat at a time, one pair of glasses at a time. Pests go with everything. The oldest pick makes room.
export const MAX_PROPS3D = 4;
export function toggleProp(active: string[], id: string, max = MAX_PROPS3D): string[] {
  if (id === 'none') return [];
  const p = BY_ID.get(id);
  if (!p) return active;
  if (active.includes(id)) return active.filter((a) => a !== id);
  const kept = p.kind === 'pest' ? active : active.filter((a) => BY_ID.get(a)?.kind !== p.kind);
  const next = [...kept, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function toStage(lm: Float32Array, i: number, aspect: number): THREE.Vector3 {
  return new THREE.Vector3(lm[i * 3] * 2 - 1, (1 - lm[i * 3 + 1] * 2) / aspect, -lm[i * 3 + 2] * 2 + 0);
}

export type Head = { centre: THREE.Vector3; width: number; quat: THREE.Quaternion };
// The head on the stage. centre: the middle between the sides of the face, in depth too (that is the middle
// of the head). width: the face width. quat: the turn of the head. Its axes: x from side to side, y from
// the chin to the forehead (made square to x), z out of the face.
export function headPose(face: Face, aspect: number): Head {
  const lm = face.landmarks;
  const right = toStage(lm, SIDE_R, aspect), left = toStage(lm, SIDE_L, aspect);
  const centre = right.clone().add(left).multiplyScalar(0.5);
  const x = left.sub(right), up = toStage(lm, FOREHEAD, aspect).sub(toStage(lm, CHIN, aspect));
  const z = new THREE.Vector3().crossVectors(x, up);
  const quat = new THREE.Quaternion();
  if (x.lengthSq() > 1e-12 && z.lengthSq() > 1e-12) { // a face with all points at one place has no turn
    x.normalize(); z.normalize();
    quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z));
  }
  return { centre, width: faceFrame(lm, aspect).width * 2, quat };
}

// Where a prop is drawn. pos in stage space, quat as x y z w, scale: size of the largest side on the stage.
export type Placed = { id: string; face: number; file: string; pos: V3; quat: [number, number, number, number]; scale: number; clip?: string };

const TAU = Math.PI * 2;
// A pest that flies leans toward the viewer, so its back and its wings show (from the side a butterfly is a line)
const LEAN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45);
// A number from 0 to 1, always the same for the same prop on the same face: every pest has its own place in the round
const phase = (id: string, face: number) => { let h = face * 7 + 3; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return h / 997; };

function pest(p: Prop3D & Pest, head: Head, lm: Float32Array, aspect: number, face: number, t: number): Pick<Placed, 'pos' | 'quat'> {
  const w = head.width, a = TAU * (t / p.period + phase(p.id, face));
  if (p.path === 'orbit') {
    const pos = new THREE.Vector3(Math.cos(a) * p.radius * w, (p.height + 0.05 * Math.sin(a * 2.3)) * w, Math.sin(a) * p.radius * w).add(head.centre);
    // it looks along its way: the way of a round is the tangent
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-Math.sin(a), Math.cos(a))).premultiply(LEAN);
    return { pos: pos.toArray() as V3, quat: q.toArray() as Placed['quat'] };
  }
  if (p.path === 'hang') {
    const side = face % 2 ? -1 : 1, swing = 0.12 * Math.sin(a);
    const pos = new THREE.Vector3(side * p.radius * w + Math.sin(swing) * 0.3 * w, p.height * w, 0.15 * w).add(head.centre);
    return { pos: pos.toArray() as V3, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), swing).toArray() as Placed['quat'] };
  }
  // crawl: a small round on the skin. The back of the bug points out of the face, its nose along the way.
  const out = new THREE.Vector3(0, 0, 1).applyQuaternion(head.quat);
  const way = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).applyQuaternion(head.quat);
  const right = new THREE.Vector3().crossVectors(out, way);
  const pos = new THREE.Vector3(Math.cos(a) * p.radius * w, Math.sin(a) * p.radius * w, p.height * w).applyQuaternion(head.quat).add(toStage(lm, p.at ?? BROW, aspect));
  return { pos: pos.toArray() as V3, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, out, way)).toArray() as Placed['quat'] };
}

// Every active prop on every face, for this time. The place depends on the landmarks and the time only,
// so a photo, a recording and the screen show the same.
// heads: the heads of the faces, when the caller has them.
export function placeProps(active: string[], faces: Face[], aspect: number, tMs: number, heads?: Head[]): Placed[] {
  const out: Placed[] = [];
  if (!active.length) return out;
  faces.forEach((f, face) => {
    const head = heads?.[face] ?? headPose(f, aspect);
    for (const id of active) {
      const p = BY_ID.get(id);
      if (!p) continue;
      if (p.kind === 'pest') { out.push({ id, face, file: p.file, ...pest(p, head, f.landmarks, aspect, face, tMs / 1000), scale: p.scale * head.width, clip: p.clip }); continue; }
      const anchor = p.at.reduce((s, i) => s.add(toStage(f.landmarks, i, aspect)), new THREE.Vector3()).multiplyScalar(1 / p.at.length);
      const pos = new THREE.Vector3(...p.offset).multiplyScalar(head.width).applyQuaternion(head.quat).add(anchor);
      out.push({ id, face, file: p.file, pos: pos.toArray() as V3, quat: head.quat.toArray() as Placed['quat'], scale: p.scale * head.width });
    }
  });
  return out;
}

// The head hides what is behind it: a pest on the far side of its round, the back of a hat. The layer draws
// these shapes into the depth buffer only. Radii and places in face widths, from the middle of the head.
// Two shapes: the face up to the hairline, as deep as a head, and the top of the head, thin. The hats are
// smaller than a real head (they are toys): a top as deep as a head cuts the front of their brim.
// The shapes are a little smaller than a head on purpose. Too large hides the glasses, too small only shows
// a pest a moment longer at the edge of the head.
export const OCCLUDERS: { radii: V3; up: number; back: number }[] = [
  { radii: [0.46, 0.57, 0.52], up: -0.07, back: 0 },
  { radii: [0.46, 0.7, 0.2], up: 0.13, back: 0 },
];
