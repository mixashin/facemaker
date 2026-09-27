import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Props3dLayer, lights, likeTheCamera, brighten, COSTUME_GAIN, type Model } from './props3dLayer';
import { headPose, placeProps, PROPS3D } from '../filters/props3d';
import { partsOf, placeParts } from '../filters/costumes';
import type { Face } from '../tracking/faceTracker';

const A = 4 / 3;
function face(cx = 0.5): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number, z = 0) => { lm[i * 3] = cx + x * 0.3; lm[i * 3 + 1] = 0.5 + y * 0.3 * A; lm[i * 3 + 2] = z * 0.3; };
  // depth as measured on a real face, in face widths: skin of the forehead +0.08, sides of the face -0.5
  set(234, -0.5, 0, 0.5); set(454, 0.5, 0, 0.5); set(10, 0, -0.56, -0.08); set(152, 0, 0.7, 0.03); set(4, 0, 0.09, -0.28); set(2, 0, 0.18, -0.12);
  set(168, 0, -0.2, -0.1); set(151, 0, -0.45, -0.1);
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) }; // no matrix: the tracker gives none
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

  it('hides what is behind the head: three shapes per head (face, top of the head, neck), in the depth buffer only', () => {
    const s = setup();
    s.run(['bee'], [face(0.3), face(0.7)]); s.pending.get('/props3d/bee.glb')!.done(model());
    s.run(['bee'], [face(0.3), face(0.7)]);
    const heads = s.heads();
    expect(heads).toHaveLength(6);
    for (const h of heads) { expect(h.material.colorWrite).toBe(false); expect(h.material.depthWrite).toBe(true); expect(h.renderOrder).toBeLessThan(0); }
    expect(Math.max(...heads.slice(0, 3).map((h) => h.position.x))).toBeLessThan(Math.min(...heads.slice(3).map((h) => h.position.x)));
    expect(heads[0].scale.y).toBeGreaterThan(heads[0].scale.x); // a head is higher than wide
    s.run(['bee'], [face(0.3)]);
    expect(s.heads()).toHaveLength(3);
  });

  it('the neck hides the hair that hangs behind it: under the chin no curl shows over the throat', () => {
    const s = setup();
    s.run(['bee'], [face()]); s.pending.get('/props3d/bee.glb')!.done(model());
    s.run(['bee'], [face()]);
    const h = headPose(face(), A);
    // a curl behind the head, under the chin (in face widths from the middle of the head: 0.9 down, 0.5 back)
    expect(front(s.heads(), h.centre.x, h.centre.y - 0.9 * h.width)).toBeGreaterThan(h.centre.z - 0.5 * h.width);
    // and the neck is not as wide as the head: a curl beside the neck shows
    expect(front(s.heads(), h.centre.x + 0.45 * h.width, h.centre.y - 0.9 * h.width)).toBe(-Infinity);
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

  it('draws the parts of a costume from their own files, beside a prop', () => {
    const s = setup();
    const faces = [face()], heads = faces.map((f) => headPose(f, A));
    const both = () => s.layer.update([...placeProps(['bee'], faces, A, 0), ...placeParts(partsOf('paint-witch'), heads)], heads, A, 0);
    both();
    expect(s.asked.sort()).toEqual(['/costumes/witch/witch-hat-hair.glb', '/costumes/witch/witch-nose.glb', '/props3d/bee.glb']);
    for (const f of s.asked) s.pending.get(f)!.done(model());
    expect(both()).toBe(true);
    expect(s.shown()).toEqual(['prop:bee#0', 'prop:witch-hat-hair#0', 'prop:witch-nose#0']);
    const hat = s.layer.scene.getObjectByName('prop:witch-hat-hair#0')!;
    expect(hat.position.toArray()).toEqual(heads[0].centre.toArray());
    expect(hat.scale.x).toBeCloseTo(heads[0].width);
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

  // Light on a matt surface, as a factor of its colour (light over pi)
  const lit = (n: THREE.Vector3) => {
    const [sky, sun] = lights() as [THREE.HemisphereLight, THREE.DirectionalLight];
    const around = sky.color.clone().lerp(sky.groundColor, 0.5 - 0.5 * n.y).multiplyScalar(sky.intensity);
    const direct = sun.color.clone().multiplyScalar(sun.intensity * Math.max(0, n.dot(sun.position.clone().normalize())));
    return (around.g + direct.g) / Math.PI;
  };
  it('no light makes a colour of a prop brighter than it is: bright parts keep their form', () => {
    for (const n of [[0, 0, 1], [0, 1, 0], [0.18, 0.44, 0.88], [0, 0.7, 0.7], [1, 0, 0]]) expect(lit(new THREE.Vector3(...n).normalize())).toBeLessThanOrEqual(1);
  });
  it('a part of a costume that faces the viewer shows its own colour: the nose must match the paint around it', () => {
    expect(lit(new THREE.Vector3(0, 0, 1)) * COSTUME_GAIN).toBeGreaterThan(0.96);
    expect(lit(new THREE.Vector3(0, 0, 1)) * COSTUME_GAIN).toBeLessThan(1.06);
    const mint = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.188, 0.597, 0.468) });
    const part = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mint));
    likeTheCamera(part, COSTUME_GAIN);
    expect(mint.color.g).toBeCloseTo(0.597 * COSTUME_GAIN);
    // nine curls share one material: its colour gets the factor one time, not nine times
    const copper = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.08, 0.05) });
    const hair = new THREE.Group();
    for (let i = 0; i < 9; i++) hair.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), copper));
    likeTheCamera(hair, COSTUME_GAIN);
    expect(copper.color.r).toBeCloseTo(0.4 * COSTUME_GAIN);
    const plain = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.5, 0.5) });
    likeTheCamera(new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), plain)));
    expect(plain.color.g).toBeCloseTo(0.5);
  });
  it('says what it draws one time per prop, also with two faces', () => {
    const s = setup();
    s.run(['crown'], [face(0.3), face(0.7)]); s.pending.get('/props3d/crown.glb')!.done(model());
    s.run(['crown'], [face(0.3), face(0.7)]);
    expect(s.layer.shown).toEqual(['crown']);
  });
  it('says what it draws: a prop that still loads is not in the list', () => {
    const s = setup();
    s.run(['crown', 'bee'], [face()]);
    expect(s.layer.shown).toEqual([]);
    s.pending.get('/props3d/crown.glb')!.done(model());
    s.run(['crown', 'bee'], [face()]);
    expect(s.layer.shown).toEqual(['crown']);
    s.run([], [face()]);
    expect(s.layer.shown).toEqual([]);
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

describe('the colours of the parts of a costume', () => {
  const thing = () => {
    const shared = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.2, 0.1) });
    return { root: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), shared)), shared };
  };
  it('the factor goes on a material one time: two meshes share it, and a second call changes nothing', () => {
    const t = thing();
    brighten(t.root, COSTUME_GAIN);
    expect(t.shared.color.r).toBeCloseTo(0.4 * COSTUME_GAIN, 6);
    brighten(t.root, COSTUME_GAIN);
    likeTheCamera(t.root, COSTUME_GAIN);
    expect(t.shared.color.r).toBeCloseTo(0.4 * COSTUME_GAIN, 6);
  });
  it('the layer gives the factor to the files of a costume, and not to a plain prop', () => {
    const made: Record<string, ReturnType<typeof thing>> = {};
    const layer = new Props3dLayer((file, done) => { made[file] = thing(); done({ scene: made[file].root, clips: [] }); });
    const at = { face: 0, pos: [0, 0, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number], scale: 1 };
    layer.update([{ ...at, id: 'witch-nose', file: '/costumes/witch/witch-nose.glb' }, { ...at, id: 'crown', file: '/props3d/crown.glb' }], [], 4 / 3, 0);
    expect(made['/costumes/witch/witch-nose.glb'].shared.color.r).toBeCloseTo(0.4 * COSTUME_GAIN, 6);
    expect(made['/props3d/crown.glb'].shared.color.r).toBeCloseTo(0.4, 6);
    layer.dispose();
  });
});
