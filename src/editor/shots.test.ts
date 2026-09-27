import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { turn, shotSize, cardSize, Shots, type ShotRenderer } from './shots';
import { COSTUME_GAIN, type Model } from '../render/props3dLayer';
import type { EditorSticker } from './editor';
import { OCCLUDERS } from '../filters/props3d';

const front = (yaw: number, pitch: number) => new THREE.Vector3(0, 0, 1).applyQuaternion(turn(yaw, pitch));
const top = (yaw: number, pitch: number) => new THREE.Vector3(0, 1, 0).applyQuaternion(turn(yaw, pitch));

describe('turn', () => {
  it('no turn: the front looks at the viewer', () => {
    expect(front(0, 0).toArray()).toEqual([0, 0, 1]);
  });
  it('yaw turns the front to the right of the screen', () => {
    const f = front(Math.PI / 2, 0);
    expect(f.x).toBeCloseTo(1); expect(f.z).toBeCloseTo(0);
    expect(top(Math.PI / 2, 0).y).toBeCloseTo(1); // the prop stays upright
  });
  it('pitch tips the top to the viewer', () => {
    const t = top(0, Math.PI / 4);
    expect(t.z).toBeGreaterThan(0.7); expect(t.y).toBeGreaterThan(0.7); expect(t.x).toBeCloseTo(0);
  });
  it('pitch goes around the line that lies on the screen, whatever the yaw is', () => {
    for (const yaw of [0.3, 1.5, 3, -2]) {
      const t = top(yaw, 0.5);
      expect(t.x).toBeCloseTo(0); expect(t.z).toBeCloseTo(Math.sin(0.5)); expect(t.y).toBeCloseTo(Math.cos(0.5));
    }
  });
});

describe('shotSize', () => {
  it('follows the size of the sticker on the photo in steps, so a pinch does not build a new picture buffer for every frame', () => {
    expect(shotSize(200)).toBe(256);
    expect(shotSize(256)).toBe(256);
    expect(shotSize(257)).toBe(512);
    expect(shotSize(900)).toBe(1024);
    expect(shotSize(1780)).toBe(2048); // the hat of a costume at the size of a head
  });
  it('holds limits', () => {
    expect(shotSize(3)).toBe(128);
    expect(shotSize(NaN)).toBe(128);
    expect(shotSize(99999)).toBe(2048);
  });
});

describe('cardSize', () => {
  it('the long side of a flat sticker is one unit', () => {
    expect(cardSize(200, 100)).toEqual([1, 0.5]);
    expect(cardSize(100, 200)).toEqual([0.5, 1]);
    expect(cardSize(36, 36)).toEqual([1, 1]);
    expect(cardSize(0, 0)).toEqual([1, 1]); // a picture with no size of its own (some SVG files)
  });
});

describe('Shots', () => {
  const model = (): Model => ({ scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshStandardMaterial())), clips: [] });
  function setup(renderer: 'yes' | 'none' = 'yes') {
    const asked: string[] = [], sizes: number[] = [], log: string[] = [];
    const pending = new Map<string, { done: (m: Model) => void; fail: () => void }>();
    const gl = { domElement: { width: 300, height: 150 }, setSize(n: number) { sizes.push(n); gl.domElement.width = gl.domElement.height = n; }, render() { log.push('render'); }, dispose() { log.push('dispose'); }, forceContextLoss() { log.push('context given back'); } };
    const shots = new Shots((file, done, fail) => { asked.push(file); pending.set(file, { done, fail }); }, () => (renderer === 'yes' ? (gl as unknown as ShotRenderer) : null));
    return { shots, asked, sizes, log, pending };
  }
  const sticker = (scale: number, more: Partial<EditorSticker> = {}): EditorSticker => ({ id: 1, src: '/props3d/crown-chip.webp', model: 'crown', x: 0, y: 0, scale, rot: 0, ...more });

  it('with no 3D renderer a prop is not ready, and its file is not asked for', async () => {
    const s = setup('none');
    expect(await s.shots.model('crown')).toBe(false);
    expect(s.asked).toEqual([]);
    expect(s.shots.draw(sticker(100))).toBeNull();
  });
  it('a prop that is not in the list is not ready', async () => {
    expect(await setup().shots.model('no-such-prop')).toBe(false);
  });
  it('loads a prop one time for several taps, and draws it when it is there', async () => {
    const s = setup();
    const a = s.shots.model('crown'), b = s.shots.model('crown');
    expect(s.asked).toEqual(['/props3d/crown.glb']);
    expect(s.shots.draw(sticker(100))).toBeNull(); // not there yet
    s.pending.get('/props3d/crown.glb')!.done(model());
    expect(await a).toBe(true); expect(await b).toBe(true);
    expect(await s.shots.model('crown')).toBe(true);
    expect(s.asked).toHaveLength(1);
    expect(s.shots.draw(sticker(100))).not.toBeNull();
    expect(s.log).toContain('render');
  });
  it('a prop that fails to load is not ready, and the next tap asks again', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    s.pending.get('/props3d/crown.glb')!.fail();
    expect(await a).toBe(false);
    const b = s.shots.model('crown');
    expect(s.asked).toHaveLength(2);
    s.pending.get('/props3d/crown.glb')!.done(model());
    expect(await b).toBe(true);
  });
  it('the picture buffer only grows: two stickers of two sizes do not build it new for every draw', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    s.pending.get('/props3d/crown.glb')!.done(model());
    await a;
    for (let i = 0; i < 3; i++) { s.shots.draw(sticker(500)); s.shots.draw(sticker(60)); }
    expect(s.sizes).toEqual([1024]);
  });
  it('turns the prop around its middle, and a mirrored sticker the other way', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    const m = model();
    m.scene.children[0].position.set(0, 0.25, 0); // as a hat: the origin is at the opening, the middle is above it
    s.pending.get('/props3d/crown.glb')!.done(m);
    await a;
    s.shots.draw(sticker(100, { yaw: 0.5 }));
    const middle = new THREE.Box3().setFromObject(m.scene.parent!).getCenter(new THREE.Vector3());
    expect(middle.length()).toBeCloseTo(0, 5);
    const q = m.scene.parent!.quaternion.clone();
    s.shots.draw(sticker(100, { yaw: 0.5, flip: true }));
    expect(m.scene.parent!.quaternion.angleTo(q)).toBeCloseTo(1, 5); // from 0.5 to -0.5
  });
  // A part of a costume is made around a head: one unit is the face width, the origin is the middle of the head
  const part = (): Model => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.8), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.2, 0.1) }));
    mesh.position.set(0, 0.44, -0.2);
    const twin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mesh.material); // two meshes, one material
    return { scene: new THREE.Group().add(mesh, twin), clips: [] };
  };
  const hat = '/costumes/witch/witch-hat-hair.glb';
  it('a part of a costume: its long side is one unit, it turns around its middle, and it has the colours of the live camera', async () => {
    const s = setup();
    const a = s.shots.model('witch-hat-hair');
    expect(s.asked).toEqual([hat]);
    const m = part();
    s.pending.get(hat)!.done(m);
    expect(await a).toBe(true);
    const sticker3d = sticker(100, { src: '/costumes/witch/witch-hat-hair-chip.webp', model: 'witch-hat-hair', yaw: 0.3 });
    expect(s.shots.draw(sticker3d)).not.toBeNull();
    m.scene.parent!.quaternion.identity(); m.scene.parent!.updateMatrixWorld(true);
    const box = new THREE.Box3(), size = new THREE.Vector3();
    for (const mesh of m.scene.children.slice(0, 2)) box.expandByObject(mesh); // what shows: not the hidden head
    box.getSize(size);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 5);
    expect(size.x / size.y).toBeCloseTo(2 / 3, 5); // the form stays
    expect(box.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0, 5);
    const c = ((m.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
    expect(c.r).toBeCloseTo(0.4 * COSTUME_GAIN, 5); expect(c.b).toBeCloseTo(0.1 * COSTUME_GAIN, 5); // one time, for a material that two meshes share
  });
  const shapes = (m: Model) => { const all: THREE.Mesh[] = []; m.scene.parent!.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && !(mesh.material as THREE.Material).colorWrite) all.push(mesh); }); return all; };
  it('a part that goes around the head has the hidden head in it: the hair behind the head does not hang over the face of the photo', async () => {
    const s = setup();
    const a = s.shots.model('witch-hat-hair');
    const m = part(); // from -1.1 to 0.7 in depth: it reaches behind the middle of the head
    s.pending.get(hat)!.done(m);
    await a;
    const head = shapes(m);
    expect(head).toHaveLength(OCCLUDERS.length);
    expect(head.every((h) => h.renderOrder < 0 && (h.material as THREE.Material).depthWrite)).toBe(true); // into the depth buffer first, and no colour
    m.scene.parent!.quaternion.identity(); m.scene.parent!.updateMatrixWorld(true);
    // the head is in the frame of the part: it has the scale and the place of the part
    const k = 1 / 3, mid = new THREE.Vector3(0, 0.44, -0.2);
    head.forEach((h, i) => {
      const want = new THREE.Vector3(0, OCCLUDERS[i].up, -OCCLUDERS[i].back).sub(mid).multiplyScalar(k);
      expect(h.getWorldPosition(new THREE.Vector3()).distanceTo(want), 'place ' + i).toBeLessThan(1e-6);
      expect(h.getWorldScale(new THREE.Vector3()).toArray().map((n) => +n.toFixed(6))).toEqual(OCCLUDERS[i].radii.map((r) => +(r * k).toFixed(6)));
    });
    const c = ((m.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
    expect(c.r).toBeCloseTo(0.4 * COSTUME_GAIN, 5); // the size and the colours are as without the head
    const size = new THREE.Box3().setFromObject(m.scene.children[0]).getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(1, 5);
  });
  it('a part in front of the face has no hidden head: a nose that the child turns round does not go away', async () => {
    const s = setup();
    const a = s.shots.model('witch-nose');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.64), new THREE.MeshStandardMaterial());
    mesh.position.set(0.03, -0.01, 0.71); // from 0.39 to 1.03 in depth
    const m: Model = { scene: new THREE.Group().add(mesh), clips: [] };
    s.pending.get('/costumes/witch/witch-nose.glb')!.done(m);
    await a;
    expect(shapes(m)).toHaveLength(0);
  });
  it('a 3D prop has no hidden head', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    const m = model();
    s.pending.get('/props3d/crown.glb')!.done(m);
    await a;
    expect(shapes(m)).toHaveLength(0);
  });
  it('a 3D prop keeps its size and its colours', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    const m = model();
    ((m.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setRGB(0.4, 0.2, 0.1);
    (m.scene.children[0] as THREE.Mesh).scale.setScalar(0.8); // a prop with a long side of 0.8 stays that small
    s.pending.get('/props3d/crown.glb')!.done(m);
    await a;
    const size = new THREE.Box3().setFromObject(m.scene.parent!).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.8, 5);
    expect(((m.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.r).toBeCloseTo(0.4, 5);
  });
  it('gives the context back at the end', async () => {
    const s = setup();
    const a = s.shots.model('crown');
    s.pending.get('/props3d/crown.glb')!.done(model());
    await a;
    s.shots.draw(sticker(100));
    s.shots.dispose();
    expect(s.log.slice(-2)).toEqual(['dispose', 'context given back']);
    expect(s.shots.draw(sticker(100))).toBeNull();
  });
});
