import * as THREE from 'three';
import vert from './quad.vert?raw';
import frag from './makeup.frag?raw';
import { UV, VERTS, meshPositions, trianglesOutside } from './faceMesh';
import { lookById, paintLook, paintSkin, MOUTH, EYE_R, EYE_L, type LookId } from '../filters/makeup';
import type { Face } from '../tracking/faceTracker';

const TEX = 512; // the flat face layout, pixels per side
const FACES = 2; // same as the tracker
const BLUR = 0.02; // blur radius as a fraction of the face width
const L_SIDE = 234, R_SIDE = 454;
// The mesh has holes where paint must never land: the inside of the mouth and the eyeballs.
// A look that covers the eyes on purpose (cucumber slices) keeps the eye triangles.
const OPEN = trianglesOutside([MOUTH, EYE_R, EYE_L]);
const EYES_COVERED = trianglesOutside([MOUTH]);

// One mesh per face in the first render pass (renderer.ts): over the camera picture, under the stickers.
export class MakeupLayer {
  private meshes: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private canvas: HTMLCanvasElement;
  private lookTex: THREE.CanvasTexture;
  private skinTex: THREE.CanvasTexture;
  private look: LookId = 'none';
  private open = new THREE.BufferAttribute(OPEN, 1);
  private covered = new THREE.BufferAttribute(EYES_COVERED, 1);

  constructor(private scene: THREE.Scene, cam: THREE.Texture, makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {
    const texture = (c: HTMLCanvasElement) => {
      c.width = c.height = TEX;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace; // values go through as they are, like the camera picture (renderer.ts)
      t.premultiplyAlpha = true; // with straight alpha, the filter mixes paint with the black of empty texels: a dark rim
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      return t;
    };
    this.canvas = makeCanvas();
    this.lookTex = texture(this.canvas);
    const skin = makeCanvas();
    this.skinTex = texture(skin);
    paintSkin(skin.getContext('2d')!, TEX);
    for (let i = 0; i < FACES; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setIndex(this.open);
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uCam: { value: cam }, uLook: { value: this.lookTex }, uSkin: { value: this.skinTex }, uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 0 }, uSmooth: { value: 0 }, uFlat: { value: 0 } },
        depthTest: false,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; // the positions change every frame, the bounds do not follow
      m.renderOrder = 1; // after the camera picture. Stickers are transparent: they draw after every opaque mesh
      m.visible = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  update(id: LookId, faces: Face[], width: number, height: number): void {
    const look = lookById(id);
    if (look.id !== this.look) {
      this.look = look.id;
      paintLook(this.canvas.getContext('2d')!, look, TEX);
      this.lookTex.needsUpdate = true;
      for (const m of this.meshes) m.geometry.setIndex(look.eyes === 'covered' ? this.covered : this.open);
    }
    this.meshes.forEach((m, i) => {
      const f = look.id === 'none' ? undefined : faces[i];
      m.visible = !!f;
      if (!f) return;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      meshPositions(f.landmarks, pos.array as Float32Array);
      pos.needsUpdate = true;
      const u = m.material.uniforms;
      (u.uSize.value as THREE.Vector2).set(width, height);
      const dx = (f.landmarks[R_SIDE * 3] - f.landmarks[L_SIDE * 3]) * width, dy = (f.landmarks[R_SIDE * 3 + 1] - f.landmarks[L_SIDE * 3 + 1]) * height;
      u.uRadius.value = Math.hypot(dx, dy) * BLUR; // face width in pixels, also on a head that leans
      u.uSmooth.value = look.smooth;
      u.uFlat.value = look.flat ?? 0;
    });
  }

  dispose(): void {
    this.meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); this.scene.remove(m); });
    this.lookTex.dispose();
    this.skinTex.dispose();
  }
}
