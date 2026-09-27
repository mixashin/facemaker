import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Props3dLayer, type Model } from './props3dLayer';
import { headPose, placeProps, PROPS3D } from '../filters/props3d';
import type { Face } from '../tracking/faceTracker';

const A = 4 / 3;
function face(cx = 0.5): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number, z = 0) => { lm[i * 3] = cx + x * 0.3; lm[i * 3 + 1] = 0.5 + y * 0.3 * A; lm[i * 3 + 2] = z * 0.3; };
  // depth as measured on a real face, in face widths: skin of the forehead +0.08, sides of the face -0.5
  set(234, -0.5, 0, 0.5); set(454, 0.5, 0, 0.5); set(10, 0, -0.56, -0.08); set(152, 0, 0.7, 0.03); set(4, 0, 0.09, -0.28);
  set(168, 0, -0.2, -0.1); set(151, 0, -0.45, -0.1);
  return { landmarks: lm, matrix: new Float32Array(new THREE.Matrix4().toArray()), blend: new Float32Array(52) };
}
// As in a real file: the clip moves a part of the model by its name (a wing), not the model as a whole.
const model = (): Model => {
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  body.name = 'wing';
  return { scene: new THREE.Group().add(body), clips: [new THREE.AnimationClip('fly', 2, [new THREE.NumberKeyframeTrack('wing.position[x]', [0, 1, 2], [0, 0.5, 0])])] };
};
function setup() {
  const pending = new Map<string, { done: (m: Model) => void; fail: () => void }>();
  const asked: string[] = [];
  const clock = { t: 0 };
  const layer = new Props3dLayer((file, done, fail) => { asked.push(file); pending.set(file, { done, fail }); }, () => clock.t);
  const run = (active: string[], faces: Face[], tMs = 0) => layer.update(placeProps(active, faces, A, tMs), faces.map((f) => headPose(f, A)), A, tMs);
  const heads = () => layer.scene.children.filter((c) => c.name.startsWith('head') && c.visible) as Shape[];
  const shown = () => layer.scene.children.filter((c) => c.name.startsWith('prop:') && c.visible).map((c) => c.name).sort();
  return { layer, pending, asked, clock, run, shown, heads };
}
type Shape = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
// The depth of the hidden head at a point of the picture (a head that looks at the camera): its front, or nothing
const front = (shapes: Shape[], x: number, y: number) => Math.max(...shapes.map((h) => {
  const k = 1 - ((x - h.position.x) / h.scale.x) ** 2 - ((y - h.position.y) / h.scale.y) ** 2;
  return k > 0 ? h.position.z + h.scale.z * Math.sqrt(k) : -Infinity;
}));

describe('Props3dLayer', () => {
  it('has nothing to draw without a prop', () => {
    const s = setup();
    expect(s.run([], [face()])).toBe(false);
    expect(s.asked).toEqual([]);
  });

  it('loads a model once and draws the prop when it is there', () => {
    const s = setup();
    expect(s.run(['crown'], [face()])).toBe(false);
    expect(s.asked).toEqual(['/props3d/crown.glb']);
    s.run(['crown'], [face()]);
    expect(s.asked).toHaveLength(1);
    s.pending.get('/props3d/crown.glb')!.done(model());
    expect(s.run(['crown'], [face()])).toBe(true);
    expect(s.shown()).toEqual(['prop:crown#0']);
  });

  it('puts the prop where the placement says', () => {
    const s = setup();
    s.run(['crown'], [face()]); s.pending.get('/props3d/crown.glb')!.done(model());
    s.run(['crown'], [face()]);
    const want = placeProps(['crown'], [face()], A, 0)[0];
    const got = s.layer.scene.getObjectByName('prop:crown#0')!;
    expect(got.position.toArray()).toEqual(want.pos);
    expect(got.scale.x).toBeCloseTo(want.scale);
    expect(got.quaternion.toArray()).toEqual(want.quat);
  });

  it('dresses two faces, and takes a prop off a face that left', () => {
    const s = setup();
    s.run(['crown'], [face(0.3), face(0.7)]); s.pending.get('/props3d/crown.glb')!.done(model());
    s.run(['crown'], [face(0.3), face(0.7)]);
    expect(s.shown()).toEqual(['prop:crown#0', 'prop:crown#1']);
    s.run(['crown'], [face(0.3)]);
    expect(s.shown()).toEqual(['prop:crown#0']);
    expect(s.run([], [face(0.3)])).toBe(false);
    expect(s.shown()).toEqual([]);
  });

  it('plays the clip of a pest by the time of the frame, not by its own clock', () => {
    const s = setup();
    s.run(['bee'], [face()], 0); s.pending.get('/props3d/bee.glb')!.done(model());
    s.run(['bee'], [face()], 1000);
    const body = s.layer.scene.getObjectByName('prop:bee#0')!.getObjectByName('wing')!;
    expect(body.position.x).toBeCloseTo(0.5); // the middle of the clip
    s.run(['bee'], [face()], 3000); // one round later: the same pose
    expect(body.position.x).toBeCloseTo(0.5);
    s.run(['bee'], [face()], 2000);
    expect(body.position.x).toBeCloseTo(0);
  });

  it('hides what is behind the head: two shapes per head (face, top of the head), in the depth buffer only', () => {
    const s = setup();
    s.run(['bee'], [face(0.3), face(0.7)]); s.pending.get('/props3d/bee.glb')!.done(model());
    s.run(['bee'], [face(0.3), face(0.7)]);
    const heads = s.heads();
    expect(heads).toHaveLength(4);
    for (const h of heads) { expect(h.material.colorWrite).toBe(false); expect(h.material.depthWrite).toBe(true); expect(h.renderOrder).toBeLessThan(0); }
    expect(Math.min(...heads.slice(0, 2).map((h) => h.position.x))).toBeLessThan(Math.min(...heads.slice(2).map((h) => h.position.x)));
    expect(heads[0].scale.y).toBeGreaterThan(heads[0].scale.x); // a head is higher than wide
    s.run(['bee'], [face(0.3)]);
    expect(s.heads()).toHaveLength(2);
  });

  it('the head hides a pest that is behind it, not a pest in front of it', () => {
    const s = setup();
    s.run(['bee'], [face()]); s.pending.get('/props3d/bee.glb')!.done(model());
    const at = Array.from({ length: 50 }, (_, i) => placeProps(['bee'], [face()], A, i * 100)[0]);
    const far = at.reduce((a, b) => (b.pos[2] < a.pos[2] ? b : a)), near = at.reduce((a, b) => (b.pos[2] > a.pos[2] ? b : a));
    s.run(['bee'], [face()]);
    expect(front(s.heads(), far.pos[0], far.pos[1])).toBeGreaterThan(far.pos[2]);
    expect(front(s.heads(), near.pos[0], near.pos[1])).toBeLessThan(near.pos[2]);
  });

  it('the head does not cut what is worn: the glasses, the bug on the skin and the front of every hat are in front of it', () => {
    const s = setup();
    const worn = PROPS3D.filter((p) => p.kind !== 'pest' || p.path === 'crawl');
    expect(worn.map((p) => p.id)).toEqual(['party-hat', 'pirate-hat', 'crown', 'witch-hat', 'sunglasses', 'ladybug']);
    for (const p of worn) {
      s.run([p.id], [face()]); s.pending.get(p.file)!.done(model());
      s.run([p.id], [face()]);
      const o = s.layer.scene.getObjectByName(`prop:${p.id}#0`)!;
      // a hat: the front of its opening. The opening of every hat is 0.4 of its largest side or more.
      const z = o.position.z + (p.kind === 'hat' ? 0.2 * o.scale.x : 0);
      expect(front(s.heads(), o.position.x, o.position.y), p.id).toBeLessThan(z);
    }
  });

  it('writes colours as the camera picture has them (no tone mapping, sRGB values)', () => {
    const s = setup();
    const m = model();
    s.run(['crown'], [face()]); s.pending.get('/props3d/crown.glb')!.done(m);
    const mat = (m.scene.getObjectByName('wing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material;
    expect(mat.toneMapped).toBe(false);
    const shader = { fragmentShader: 'void main() {\n#include <colorspace_fragment>\n}' };
    mat.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('sRGBTransferOETF');
    expect(shader.fragmentShader).not.toContain('colorspace_fragment');
    // The patch replaces one line of the shaders of Three.js. If a release of Three.js renames it, the patch does
    // nothing and the props get dark: this fails then.
    expect(THREE.ShaderLib.standard.fragmentShader).toContain('#include <colorspace_fragment>');
    expect(THREE.ShaderLib.basic.fragmentShader).toContain('#include <colorspace_fragment>');
    expect(THREE.ShaderChunk.colorspace_pars_fragment).toContain('sRGBTransferOETF');
  });

  it('keeps the shape of the picture', () => {
    const s = setup();
    s.run([], [face()]);
    expect(s.layer.camera.top).toBeCloseTo(1 / A);
    expect(s.layer.camera.bottom).toBeCloseTo(-1 / A);
    s.layer.update([], [], 9 / 16, 0);
    expect(s.layer.camera.top).toBeCloseTo(16 / 9);
  });

  it('asks again for a model that failed to load, but not every frame', () => {
    const s = setup();
    s.run(['crown'], [face()]);
    s.pending.get('/props3d/crown.glb')!.fail();
    for (let i = 0; i < 5; i++) { s.clock.t += 16; s.run(['crown'], [face()]); }
    expect(s.asked).toHaveLength(1);
    s.clock.t += 5000;
    s.run(['crown'], [face()]);
    expect(s.asked).toHaveLength(2);
  });
});
