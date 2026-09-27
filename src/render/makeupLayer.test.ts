import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MakeupLayer } from './makeupLayer';
import type { Face } from '../tracking/faceTracker';
import type { Look } from '../filters/makeup';

function face(x: number): Face {
  const lm = new Float32Array(478 * 3);
  for (let i = 0; i < 478; i++) { lm[i * 3] = x; lm[i * 3 + 1] = 0.5; }
  lm[234 * 3] = x - 0.1; lm[454 * 3] = x + 0.1; // face width 0.2 of the picture
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}
function setup(looks?: Look[]) {
  const clears: number[] = [], drawn: unknown[] = [];
  const pending = new Map<string, (img: never) => void>();
  const makeCanvas = () => {
    const n = clears.push(0) - 1;
    const g = new Proxy({}, { get: (_t, k) => (k === 'clearRect' ? () => { clears[n]++; } : k === 'drawImage' ? (img: unknown) => { drawn.push(img); } : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
    return { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement;
  };
  const load = (src: string, done: (img: never) => void) => { pending.set(src, done); };
  const scene = new THREE.Scene();
  const layer = new MakeupLayer(scene, new THREE.Texture(), makeCanvas, load as never, looks ? (id) => looks.find((l) => l.id === id) ?? looks[0] : undefined);
  const meshes = scene.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  return { layer, scene, meshes, clears, drawn, pending, shown: () => meshes.filter((m) => m.visible).length };
}
const NONE: Look = { id: 'none', icon: 'x', smooth: 0, layers: [] };
const painted = (name: string): Look => ({ id: 'paint-' + name, icon: 'x', smooth: 0, layers: [], img: `/makeup/${name}.webp` });

describe('MakeupLayer', () => {
  it('shows nothing without a look or without a face', () => {
    const s = setup();
    s.layer.update('none', [face(0.5)], 640, 480);
    expect(s.shown()).toBe(0);
    s.layer.update('glam', [], 640, 480);
    expect(s.shown()).toBe(0);
  });
  it('paints two faces', () => {
    const s = setup();
    s.layer.update('glam', [face(0.25), face(0.75)], 640, 480);
    expect(s.shown()).toBe(2);
    expect(s.meshes[0].geometry.getAttribute('position').getX(0)).toBeCloseTo(-0.5);
    expect(s.meshes[1].geometry.getAttribute('position').getX(0)).toBeCloseTo(0.5);
  });
  it('hides the mesh of a face that left', () => {
    const s = setup();
    s.layer.update('glam', [face(0.25), face(0.75)], 640, 480);
    s.layer.update('glam', [face(0.25)], 640, 480);
    expect(s.meshes.map((m) => m.visible)).toEqual([true, false]);
    s.layer.update('none', [face(0.25)], 640, 480);
    expect(s.shown()).toBe(0);
  });
  it('follows the size of the picture and the size of the face', () => {
    const s = setup();
    s.layer.update('glam', [face(0.5)], 640, 480);
    const u = s.meshes[0].material.uniforms;
    expect((u.uSize.value as THREE.Vector2).toArray()).toEqual([640, 480]);
    const r640 = u.uRadius.value as number;
    expect(r640).toBeGreaterThan(0);
    s.layer.update('glam', [face(0.5)], 1280, 720);
    expect((u.uSize.value as THREE.Vector2).toArray()).toEqual([1280, 720]);
    expect(u.uRadius.value).toBeCloseTo(r640 * 2);
    expect(u.uSmooth.value).toBeGreaterThan(0);
  });
  it('paints a look once, not every frame', () => {
    const s = setup();
    const look = () => s.clears[0]; // first canvas: the look. second: the skin mask
    s.layer.update('glam', [face(0.5)], 640, 480);
    s.layer.update('glam', [face(0.5)], 640, 480);
    expect(look()).toBe(1);
    s.layer.update('soft', [face(0.5)], 640, 480);
    expect(look()).toBe(2);
    expect(s.clears[1]).toBe(1);
  });
  it('culls back faces and draws after the camera picture', () => {
    const s = setup();
    expect(s.meshes.length).toBe(2);
    for (const m of s.meshes) {
      expect(m.material.side).toBe(THREE.FrontSide);
      expect(m.material.transparent).toBe(false);
      expect(m.renderOrder).toBeGreaterThan(0);
      expect(m.frustumCulled).toBe(false);
    }
  });
  it('has holes for the mouth and the eyes, so no paint lands on teeth or eyeballs', () => {
    const s = setup();
    s.layer.update('glam', [face(0.5)], 640, 480);
    expect(s.meshes[0].geometry.getIndex()!.count).toBe((898 - 18 - 14 - 14) * 3);
    s.layer.update('cucumber', [face(0.5)], 640, 480); // the slices cover the eyes on purpose
    expect(s.meshes[0].geometry.getIndex()!.count).toBe((898 - 18) * 3);
    s.layer.update('tiger', [face(0.5)], 640, 480);
    expect(s.meshes[0].geometry.getIndex()!.count).toBe((898 - 18 - 14 - 14) * 3);
  });
  it('keeps the smoothing on a head that leans to the side', () => {
    const s = setup();
    const f = face(0.5);
    f.landmarks[234 * 3] = 0.5; f.landmarks[454 * 3] = 0.5;         // cheeks one above the other
    f.landmarks[234 * 3 + 1] = 0.3; f.landmarks[454 * 3 + 1] = 0.7; // 0.4 of the height apart
    s.layer.update('glam', [f], 640, 480);
    expect(s.meshes[0].material.uniforms.uRadius.value).toBeCloseTo(0.4 * 480 * 0.02);
  });
  it('gives the shader flat paint for a look that asks for it', () => {
    const s = setup();
    s.layer.update('glam', [face(0.5)], 640, 480);
    expect(s.meshes[0].material.uniforms.uFlat.value).toBe(0);
    s.layer.update('cucumber', [face(0.5)], 640, 480);
    expect(s.meshes[0].material.uniforms.uFlat.value).toBeGreaterThan(0.5);
  });
  it('uploads the paint upright and premultiplied (no dark rim at hard edges)', () => {
    const s = setup();
    const look = s.meshes[0].material.uniforms.uLook.value as THREE.Texture;
    expect(look.flipY).toBe(true);
    expect(look.premultiplyAlpha).toBe(true);
    expect(look.colorSpace).toBe(THREE.NoColorSpace);
  });
  it('loads the picture of a look and paints it when it is there', () => {
    const s = setup([NONE, painted('tiger')]);
    s.layer.update('paint-tiger', [face(0.5)], 640, 480);
    expect([...s.pending.keys()]).toEqual(['/makeup/tiger.webp']);
    expect(s.drawn).toHaveLength(0);
    expect(s.shown()).toBe(1); // the mesh is there, the paint comes
    const img = { width: 1024, height: 1024 };
    s.pending.get('/makeup/tiger.webp')!(img as never);
    expect(s.drawn).toEqual([img]);
    s.layer.update('paint-tiger', [face(0.5)], 640, 480);
    expect(s.drawn).toHaveLength(1); // once
  });
  it('drops a picture that arrives after the child picked another look', () => {
    const s = setup([NONE, painted('tiger'), painted('cat')]);
    s.layer.update('paint-tiger', [face(0.5)], 640, 480);
    s.layer.update('paint-cat', [face(0.5)], 640, 480);
    s.pending.get('/makeup/tiger.webp')!({ width: 1024, height: 1024 } as never);
    expect(s.drawn).toHaveLength(0);
    const cat = { width: 1024, height: 1024 };
    s.pending.get('/makeup/cat.webp')!(cat as never);
    expect(s.drawn).toEqual([cat]);
  });
  it('leaves the scene on dispose', () => {
    const s = setup();
    s.layer.dispose();
    expect(s.scene.children.length).toBe(0);
  });
});
