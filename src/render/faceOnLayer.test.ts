import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaceOnLayer, type FaceOnView } from './faceOnLayer';
import { TARGETS, SPAN } from '../filters/faceon';

function setup() {
  const pending = new Map<string, (img: never) => void>();
  const failing = new Map<string, () => void>();
  const asked: string[] = [];
  const clock = { t: 0 };
  const load = (src: string, done: (img: never) => void, fail: () => void) => { asked.push(src); pending.set(src, done); failing.set(src, fail); };
  const scene = new THREE.Scene();
  const shared = { uTex: { value: null }, uAspect: { value: 4 / 3 }, uMirror: { value: true }, uCount: { value: 0 }, uHandle: { value: [] }, uType: { value: [] } };
  const layer = new FaceOnLayer(scene, shared, load as never, () => clock.t);
  const group = scene.children[0] as THREE.Group;
  const [picture, face] = group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  const arrive = (src: string, width = 1280, height = 1280) => pending.get(src)!({ width, height } as never);
  return { layer, scene, shared, group, picture, face, pending, failing, asked, clock, arrive };
}
const cat = TARGETS.find((t) => t.id === 'cat')!;
const view = (over: Partial<FaceOnView> = {}): FaceOnView => ({ target: cat, frame: { nose: [0.5, 0.5], width: 0.3, roll: 0.1 }, wins: [[-0.2, -0.2, 0.1, 0.06, -0.05, -0.02], [0.2, -0.2, 0.1, 0.06, 0.05, -0.02], [0, 0.25, 0.16, 0.06, 0, 0.07]], ...over });

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
    expect(s.face.scale.x).toBeCloseTo(SPAN * cat.width, 5);
    expect(s.face.material.uniforms.uRoll.value).toBeCloseTo(0.1);
    const win = (s.face.material.uniforms.uWin.value as THREE.Vector4[])[2].toArray();
    [0, 0.25, 0.16, 0.06].forEach((v, i) => expect(win[i]).toBeCloseTo(v, 5));
    const off = (s.face.material.uniforms.uOff.value as THREE.Vector2[])[0].toArray();
    expect(off[0]).toBeCloseTo(-0.05, 5); expect(off[1]).toBeCloseTo(-0.02, 5);
  });
  it('turns the face quad with the face place of the target', () => {
    const s = setup();
    const tilted = { ...cat, id: 'photo', img: 'blob:t', angle: 0.1 };
    s.layer.update(view({ target: tilted }), [640, 480], [380, 860]); s.arrive('blob:t');
    s.layer.update(view({ target: tilted }), [640, 480], [380, 860]);
    expect(s.face.rotation.z).toBeCloseTo(-0.1, 6); // picture space has y down, the scene has y up
  });
  it('slides the picture so that a face at the side is on the screen', () => {
    const s = setup();
    const side = { ...cat, id: 'photo', img: 'blob:s', nose: [0.25, 0.5] as [number, number] };
    s.layer.update(view({ target: side }), [720, 1280], [412, 915]); s.arrive('blob:s', 1536, 1152);
    s.layer.update(view({ target: side }), [720, 1280], [412, 915]);
    expect(s.group.position.x).toBeGreaterThan(0); // the picture moves right, the face comes in from the left
    const faceX = s.group.position.x + s.face.position.x * s.group.scale.x;
    expect(Math.abs(faceX)).toBeLessThan(412 / 915 / (720 / 1280) / 2); // inside the visible column
  });
  it('asks again for a picture that failed to load, but not every frame', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]);
    s.failing.get(cat.img)!();
    for (let i = 0; i < 5; i++) { s.clock.t += 16; expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(false); }
    expect(s.asked).toHaveLength(1);
    s.clock.t += 5000;
    s.layer.update(view(), [640, 480], [380, 860]);
    expect(s.asked).toHaveLength(2);
    s.arrive(cat.img);
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(true);
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
  it('keeps one device photo: the texture of the photo before goes away', () => {
    const s = setup();
    const photo = (img: string) => view({ target: { ...cat, id: 'photo', img } });
    s.layer.update(photo('blob:a'), [640, 480], [640, 480]); s.arrive('blob:a');
    s.layer.update(photo('blob:a'), [640, 480], [640, 480]);
    const first = s.picture.material.uniforms.uTex.value as THREE.Texture;
    let gone = false;
    first.addEventListener('dispose', () => { gone = true; });
    s.layer.update(view(), [640, 480], [640, 480]); s.arrive(cat.img); // a bundled picture in between: the photo stays
    s.layer.update(view(), [640, 480], [640, 480]);
    expect(gone).toBe(false);
    s.layer.update(photo('blob:b'), [640, 480], [640, 480]); s.arrive('blob:b');
    expect(gone).toBe(true);
    expect(s.layer.update(photo('blob:b'), [640, 480], [640, 480])).toBe(true);
    expect(s.layer.update(view(), [640, 480], [640, 480])).toBe(true); // bundled pictures stay loaded
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
