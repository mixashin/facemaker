import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MakeupLayer } from './makeupLayer';
import type { Face } from '../tracking/faceTracker';

function face(x: number): Face {
  const lm = new Float32Array(478 * 3);
  for (let i = 0; i < 478; i++) { lm[i * 3] = x; lm[i * 3 + 1] = 0.5; }
  lm[234 * 3] = x - 0.1; lm[454 * 3] = x + 0.1; // face width 0.2 of the picture
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}
function setup() {
  const clears: number[] = [];
  const makeCanvas = () => {
    const n = clears.push(0) - 1;
    const g = new Proxy({}, { get: (_t, k) => (k === 'clearRect' ? () => { clears[n]++; } : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
    return { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement;
  };
  const scene = new THREE.Scene();
  const layer = new MakeupLayer(scene, new THREE.Texture(), makeCanvas);
  const meshes = scene.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  return { layer, scene, meshes, clears, shown: () => meshes.filter((m) => m.visible).length };
}

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
  it('leaves the scene on dispose', () => {
    const s = setup();
    s.layer.dispose();
    expect(s.scene.children.length).toBe(0);
  });
});
