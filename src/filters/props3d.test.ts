import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { PROPS3D, PROPS3D_CHIPS, MAX_PROPS3D, toggleProp, toStage, headPose, placeProps, type Placed } from './props3d';
import type { Face } from '../tracking/faceTracker';

const A = 4 / 3;
// Points of a face in the frame of the head: x right, y up, z front, one unit is the distance between the sides of
// the face. Depth as measured on a real face: the skin of the forehead is 0.58 in front of the sides.
const POINTS: [number, number, number, number][] = [[234, -0.5, 0, 0], [454, 0.5, 0, 0], [10, 0, 0.56, 0.58], [152, 0, -0.7, 0.47], [4, 0, -0.09, 0.78], [2, 0, -0.18, 0.62], [168, 0, 0.2, 0.6], [151, 0, 0.45, 0.6]];
// A face around (cx, cy) of the picture, its sides 0.3 of the picture width apart, with a turn of the head.
// points: other points than the ones above (a long face, an open mouth).
function face(cx = 0.5, cy = 0.5, w = 0.3, turn = new THREE.Quaternion(), points = POINTS): Face {
  const lm = new Float32Array(478 * 3), W = w * 2;
  const middle = new THREE.Vector3(cx * 2 - 1, (1 - cy * 2) / A, -0.5 * W);
  for (const [i, x, y, z] of points) {
    const p = new THREE.Vector3(x, y, z).multiplyScalar(W).applyQuaternion(turn).add(middle);
    lm[i * 3] = (p.x + 1) / 2; lm[i * 3 + 1] = (1 - p.y * A) / 2; lm[i * 3 + 2] = -p.z / 2;
  }
  return { landmarks: lm, blend: new Float32Array(52) };
}
const only = (placed: Placed[], id: string, f = 0) => placed.find((p) => p.id === id && p.face === f)!;
const v = (p: Placed) => new THREE.Vector3(...p.pos);

describe('3D props', () => {
  it('lists the eleven props with their files on disk', () => {
    expect(PROPS3D.map((p) => p.id).sort()).toEqual(['bee', 'butterfly', 'crown', 'fly', 'ladybug', 'mosquito', 'party-hat', 'pirate-hat', 'spider', 'sunglasses', 'witch-hat']);
    for (const p of PROPS3D) {
      expect(existsSync('public' + p.file), p.file).toBe(true);
      expect(existsSync('public' + p.chip), p.chip).toBe(true);
      expect(p.icon.length).toBeGreaterThan(0);
      if (p.clip) expect(p.clips, p.id).toContain(p.clip); // the clip that the live view plays exists in the file
    }
    expect(PROPS3D_CHIPS[0].id).toBe('none');
    expect(PROPS3D_CHIPS.slice(1).map((c) => c.id)).toEqual(PROPS3D.map((p) => p.id));
    expect(PROPS3D.slice(0, 5).map((p) => p.kind)).toEqual(['hat', 'hat', 'hat', 'hat', 'glasses']); // what a child wears comes first
  });
});

describe('toggleProp', () => {
  it('one hat at a time: a hat takes the place of a hat', () => {
    expect(toggleProp([], 'crown')).toEqual(['crown']);
    expect(toggleProp(['crown'], 'pirate-hat')).toEqual(['pirate-hat']);
    expect(toggleProp(['crown', 'sunglasses', 'bee'], 'witch-hat')).toEqual(['sunglasses', 'bee', 'witch-hat']);
  });
  it('glasses and pests go with a hat, pests go with each other', () => {
    expect(toggleProp(['crown'], 'sunglasses')).toEqual(['crown', 'sunglasses']);
    expect(toggleProp(['crown', 'bee'], 'fly')).toEqual(['crown', 'bee', 'fly']);
  });
  it('a second tap takes the prop off, none takes all off', () => {
    expect(toggleProp(['crown', 'bee'], 'bee')).toEqual(['crown']);
    expect(toggleProp(['crown', 'bee'], 'none')).toEqual([]);
    expect(toggleProp(['crown'], 'no-such-prop')).toEqual(['crown']);
  });
  it('holds a limit: the oldest pick makes room', () => {
    const many = ['crown', 'sunglasses', 'bee', 'fly'];
    expect(many.length).toBe(MAX_PROPS3D);
    expect(toggleProp(many, 'spider')).toEqual(['sunglasses', 'bee', 'fly', 'spider']);
  });
});

describe('stage space', () => {
  it('puts a landmark on the stage: x right, y up, z to the viewer, one unit is half the picture width', () => {
    const lm = new Float32Array([0, 0, 0, 1, 1, 0, 0.5, 0.5, -0.1]);
    expect(toStage(lm, 0, A).toArray()).toEqual([-1, 1 / A, 0]);
    expect(toStage(lm, 1, A).toArray()).toEqual([1, -1 / A, 0]);
    const mid = toStage(lm, 2, A);
    expect(mid.x).toBeCloseTo(0); expect(mid.y).toBeCloseTo(0); expect(mid.z).toBeCloseTo(0.2); // nearer to the camera
  });
  it('finds the head: middle between the sides of the face, width, no turn for a face that looks at the camera', () => {
    const h = headPose(face(0.5, 0.5, 0.3), A);
    expect(h.centre.x).toBeCloseTo(0); expect(h.centre.y).toBeCloseTo(0);
    expect(h.centre.z).toBeCloseTo(-0.3); // the middle of the head in depth: where the sides of the face are, half a face width behind the skin
    expect(h.width).toBeCloseTo(0.6 * 1.457 * Math.hypot(0.74, 0.04)); // side to side (0.6 stage units), or 1.457 of the way from the forehead to the base of the nose when that is more
    expect(h.width / 0.6).toBeGreaterThan(1.05); expect(h.width / 0.6).toBeLessThan(1.12); // as the width of faceon.ts on a real face: 1.08
    expect(h.quat.angleTo(new THREE.Quaternion())).toBeLessThan(0.12); // a real forehead stands a little before the chin
  });
  it('takes the turn of the head from the landmarks: the tracker gives no pose', () => {
    const still = headPose(face(), A).quat;
    const axis = (x: number, y: number, z: number, angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), angle);
    for (const [name, turn] of [['tilt to the shoulder', axis(0, 0, 1, 0.3)], ['turn to the side', axis(0, 1, 0, 0.5)], ['nod', axis(1, 0, 0, -0.35)], ['all at once', axis(0, 1, 0, 0.4).multiply(axis(1, 0, 0, 0.2)).multiply(axis(0, 0, 1, -0.25))]] as const) {
      const q = headPose(face(0.4, 0.55, 0.25, turn), A).quat;
      expect(q.angleTo(turn.clone().multiply(still)), name).toBeLessThan(0.01);
    }
  });
  const axisTurn = (x: number, y: number, z: number, angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), angle);
  // a round face: the way from the forehead to the nose is short, side to side gives the width
  const ROUND = POINTS.map(([i, x, y, z]) => [i, x, i === 10 ? 0.45 : y, z] as [number, number, number, number]);
  it('keeps the width when the head turns to the side, nods or tilts: a hat does not grow or shrink with the pose', () => {
    for (const points of [POINTS, ROUND]) {
      const still = headPose(face(0.5, 0.5, 0.3, undefined, points), A).width;
      for (const turn of [axisTurn(0, 1, 0, 0.6), axisTurn(1, 0, 0, 0.5), axisTurn(1, 0, 0, -0.3), axisTurn(0, 0, 1, 0.4)]) {
        expect(headPose(face(0.5, 0.5, 0.3, turn, points), A).width / still).toBeCloseTo(1, 3);
      }
    }
    expect(headPose(face(0.5, 0.5, 0.3, undefined, ROUND), A).width).toBeCloseTo(0.6);
  });
  it('keeps the width when the mouth opens wide: the chin is not in the measure', () => {
    const open = POINTS.map(([i, x, y, z]) => [i, x, i === 152 ? y - 0.25 : y, z] as [number, number, number, number]);
    expect(headPose(face(0.5, 0.5, 0.3, undefined, open), A).width).toBeCloseTo(headPose(face(), A).width, 6);
  });
  it('keeps the turn when the mouth opens wide: the chin is not in the turn', () => {
    // the jaw turns around its joint: the chin goes down and back
    const open = POINTS.map(([i, x, y, z]) => [i, x, i === 152 ? y - 0.25 : y, i === 152 ? z - 0.15 : z] as [number, number, number, number]);
    const turn = axisTurn(0, 1, 0, 0.4).multiply(axisTurn(1, 0, 0, 0.2));
    expect(headPose(face(0.5, 0.5, 0.3, undefined, open), A).quat.angleTo(headPose(face(), A).quat)).toBeLessThan(1e-6);
    expect(headPose(face(0.4, 0.55, 0.25, turn, open), A).quat.angleTo(headPose(face(0.4, 0.55, 0.25, turn), A).quat)).toBeLessThan(1e-6);
  });
  it('the frame of the head is the one that the props were fitted to: the line from the chin to the forehead of a real face, mouth closed', () => {
    const fitted = axisTurn(1, 0, 0, Math.atan2(0.11, 1.26)); // forehead and chin of POINTS
    expect(headPose(face(), A).quat.angleTo(fitted)).toBeLessThan(0.03); // POINTS has two digits: 1.2 degrees off the measure. Without the correction: 8 degrees
  });
  it('a face with all points at one place gives no turn, and no numbers that are no numbers', () => {
    const h = headPose({ landmarks: new Float32Array(478 * 3).fill(0.5), blend: new Float32Array(52) }, A);
    expect(h.quat.toArray()).toEqual([0, 0, 0, 1]);
    expect([...h.centre.toArray(), h.width].every(Number.isFinite)).toBe(true);
  });
});

describe('placeProps', () => {
  it('gives nothing without a face or without a prop', () => {
    expect(placeProps(['crown'], [], A, 0)).toEqual([]);
    expect(placeProps([], [face()], A, 0)).toEqual([]);
  });
  it('puts a hat on the head: above the forehead, a little behind it, as wide as the head', () => {
    const f = face();
    const hat = only(placeProps(['party-hat'], [f], A, 0), 'party-hat');
    const forehead = toStage(f.landmarks, 10, A);
    expect(hat.pos[1]).toBeGreaterThan(forehead.y);
    expect(hat.pos[0]).toBeCloseTo(forehead.x);
    expect(hat.pos[2]).toBeLessThan(forehead.z); // toward the middle of the head
    expect(Math.abs(hat.pos[2] - headPose(f, A).centre.z)).toBeLessThan(0.6 * 0.15); // over the middle of the head: the hat stays on the head when the head turns
    expect(hat.scale).toBeGreaterThan(0.6 * 0.6); expect(hat.scale).toBeLessThan(0.6 * 2);
  });
  it('the hat follows the size of the face and the turn of the head', () => {
    const near = only(placeProps(['crown'], [face(0.5, 0.5, 0.4)], A, 0), 'crown'), far = only(placeProps(['crown'], [face(0.5, 0.5, 0.2)], A, 0), 'crown');
    expect(near.scale / far.scale).toBeCloseTo(2);
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
    const f = face(0.5, 0.5, 0.3, roll);
    const tilted = only(placeProps(['crown'], [f], A, 0), 'crown'), upright = only(placeProps(['crown'], [face()], A, 0), 'crown');
    expect(new THREE.Quaternion(...tilted.quat).angleTo(roll)).toBeLessThan(0.12);
    expect(tilted.pos[0]).toBeLessThan(upright.pos[0]); // the offset above the forehead turns with the head: to the left for a turn to the left
  });
  it('puts the glasses on the bridge of the nose', () => {
    const f = face();
    const g = only(placeProps(['sunglasses'], [f], A, 0), 'sunglasses');
    const bridge = toStage(f.landmarks, 168, A);
    expect(v(g).distanceTo(bridge)).toBeLessThan(0.6 * 0.15);
    expect(g.scale).toBeGreaterThan(0.6 * 0.8); expect(g.scale).toBeLessThan(0.6 * 1.3);
  });
  it('names the file of the prop', () => {
    expect(only(placeProps(['crown'], [face()], A, 0), 'crown').file).toBe('/props3d/crown.glb');
  });
  it('dresses two faces', () => {
    const placed = placeProps(['crown', 'bee'], [face(0.3), face(0.7)], A, 0);
    expect(placed).toHaveLength(4);
    expect(only(placed, 'crown', 0).pos[0]).toBeLessThan(only(placed, 'crown', 1).pos[0]);
  });
  it('takes the heads that the caller has, and gives the same places', () => {
    const faces = [face(0.3), face(0.7)];
    const heads = faces.map((f) => headPose(f, A));
    expect(placeProps(['crown', 'bee'], faces, A, 500, heads)).toEqual(placeProps(['crown', 'bee'], faces, A, 500));
  });
  it('is the same for the same time', () => {
    expect(placeProps(['bee', 'spider'], [face()], A, 1234)).toEqual(placeProps(['bee', 'spider'], [face()], A, 1234));
  });
});

describe('pests', () => {
  const f = face();
  const h = headPose(f, A);
  const track = (id: string, step = 100, n = 200) => Array.from({ length: n }, (_, i) => only(placeProps([id], [f], A, i * step), id));
  it('a bee flies around the head: in front of it and behind it, at the same distance', () => {
    const path = track('bee');
    const flat = path.map((p) => Math.hypot(p.pos[0] - h.centre.x, p.pos[2] - h.centre.z));
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.02);
    expect(Math.min(...flat)).toBeGreaterThan(h.width * 0.6); // outside the head
    expect(path.some((p) => p.pos[2] > h.centre.z + h.width * 0.5)).toBe(true);
    expect(path.some((p) => p.pos[2] < h.centre.z - h.width * 0.5)).toBe(true);
  });
  it('looks where it flies', () => {
    const path = track('fly', 50, 100);
    for (let i = 0; i < path.length - 1; i++) {
      const way = v(path[i + 1]).sub(v(path[i])).setY(0).normalize();
      const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...path[i].quat)).setY(0).normalize();
      expect(nose.dot(way)).toBeGreaterThan(0.9);
    }
  });
  it('shows its back a little: a pest that flies leans toward the viewer', () => {
    for (const id of ['bee', 'butterfly']) for (const p of track(id, 250, 40)) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...p.quat));
      expect(up.z, id).toBeGreaterThan(0.25);
      expect(up.y, id).toBeGreaterThan(0.8);
    }
  });
  it('plays its clip, and two pests do not fly side by side', () => {
    const placed = placeProps(['bee', 'fly', 'mosquito'], [f], A, 500);
    expect(only(placed, 'bee').clip).toBe('fly');
    const keys = new Set(placed.map((p) => p.pos.map((n) => n.toFixed(2)).join(',')));
    expect(keys.size).toBe(3);
  });
  it('the spider hangs beside the head and swings a little', () => {
    const path = track('spider');
    for (const p of path) expect(Math.abs(p.pos[0] - h.centre.x)).toBeGreaterThan(h.width * 0.55);
    const xs = path.map((p) => p.pos[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.005);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(h.width * 0.3);
    expect(path[0].clip).toBe('idle');
  });
  it('the ladybug walks on the forehead and stays on it', () => {
    const spot = toStage(f.landmarks, 151, A);
    for (const p of track('ladybug')) expect(v(p).distanceTo(spot)).toBeLessThan(h.width * 0.25);
    expect(only(placeProps(['ladybug'], [f], A, 0), 'ladybug').clip).toBe('walk');
  });
});
