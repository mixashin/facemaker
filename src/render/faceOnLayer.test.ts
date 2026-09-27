import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaceOnLayer, type FaceOnView } from './faceOnLayer';
import { TARGETS } from '../filters/faceon';

function setup() {
  const pending = new Map<string, (img: never) => void>();
  const load = (src: string, done: (img: never) => void) => { pending.set(src, done); };
  const scene = new THREE.Scene();
  const shared = { uTex: { value: null }, uAspect: { value: 4 / 3 }, uMirror: { value: true }, uCount: { value: 0 }, uHandle: { value: [] }, uType: { value: [] } };
  const layer = new FaceOnLayer(scene, shared, load as never);
  const group = scene.children[0] as THREE.Group;
  const [picture, face] = group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  const arrive = (src: string, width = 1280, height = 1280) => pending.get(src)!({ width, height } as never);
  return { layer, scene, shared, group, picture, face, pending, arrive };
}
const cat = TARGETS.find((t) => t.id === 'cat')!;
const view = (over: Partial<FaceOnView> = {}): FaceOnView => ({ target: cat, frame: { nose: [0.5, 0.5], width: 0.3, roll: 0.1 }, wins: [[-0.2, -0.2, 0.1, 0.06], [0.2, -0.2, 0.1, 0.06], [0, 0.25, 0.16, 0.06]], ...over });

describe('FaceOnLayer', () => {
  it('draws nothing without a target', () => {
    const s = setup();
    expect(s.layer.update(null, [640, 480], [380, 860])).toBe(false);
    expect(s.group.visible).toBe(false);
  });
  it('reports not ready until the picture is loaded', () => {
    const s = setup();
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(false);
    expect(s.group.visible).toBe(false);
    expect([...s.pending.keys()]).toEqual([cat.img]);
    s.arrive(cat.img);
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(true);
    expect(s.group.visible).toBe(true);
    s.layer.update(view(), [640, 480], [380, 860]);
    expect(s.pending.size).toBe(1); // loaded once
  });
  it('goes away when the target is turned off', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(true);
    expect(s.layer.update(null, [640, 480], [380, 860])).toBe(false);
    expect(s.group.visible).toBe(false);
  });
  it('hides the face without a frame', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    s.layer.update(view({ frame: null, wins: [] }), [640, 480], [380, 860]);
    expect(s.picture.visible).toBe(true);
    expect(s.face.visible).toBe(false);
  });
  it('puts the face quad on the face place of the target', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    s.layer.update(view(), [640, 480], [380, 860]);
    expect(s.face.position.x).toBeCloseTo(cat.nose[0] - 0.5, 5);
    expect(s.face.position.y).toBeCloseTo(-(cat.nose[1] - 0.5), 5);
    expect(s.face.scale.x).toBeCloseTo(1.6 * cat.width, 5);
    expect(s.face.material.uniforms.uRoll.value).toBeCloseTo(0.1);
    const win = (s.face.material.uniforms.uWin.value as THREE.Vector4[])[2].toArray();
    [0, 0.25, 0.16, 0.06].forEach((v, i) => expect(win[i]).toBeCloseTo(v, 5));
  });
  it('fills the visible part of the stage', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    s.layer.update(view(), [640, 480], [380, 860]);
    expect((s.group.scale.x * 640) / 2).toBeCloseTo(480, 0); // a square picture as high as the canvas
    expect((s.group.scale.y * 480) / 2).toBeCloseTo(480, 0);
  });
  it('keeps the shape of a photo that is not square', () => {
    const s = setup();
    const photo = { ...cat, id: 'photo', img: 'blob:p', nose: [0.5, 0.25] as [number, number] };
    s.layer.update(view({ target: photo }), [640, 480], [640, 480]); s.arrive('blob:p', 600, 1200);
    s.layer.update(view({ target: photo }), [640, 480], [640, 480]);
    expect(s.picture.scale.y / s.picture.scale.x).toBeCloseTo(2, 5);
    expect(s.face.position.y).toBeCloseTo(-(0.25 - 0.5) * 2, 5); // y in units of the picture width
  });
  it('shares the filter uniforms with the warp shader', () => {
    const s = setup();
    expect(s.face.material.uniforms.uHandle).toBe(s.shared.uHandle);
    expect(s.face.material.uniforms.uTex).toBe(s.shared.uTex);
    expect(s.face.material.transparent).toBe(true);
  });
  it('leaves the scene on dispose', () => {
    const s = setup();
    s.layer.dispose();
    expect(s.scene.children.length).toBe(0);
  });
});
