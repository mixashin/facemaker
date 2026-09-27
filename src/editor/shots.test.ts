import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { turn, shotSize, cardSize, Shots, type ShotRenderer } from './shots';
import type { Model } from '../render/props3dLayer';
import type { EditorSticker } from './editor';

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
  });
  it('holds limits', () => {
    expect(shotSize(3)).toBe(128);
    expect(shotSize(NaN)).toBe(128);
    expect(shotSize(99999)).toBe(1024);
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
