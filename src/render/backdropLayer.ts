import * as THREE from 'three';
import { coverScale } from '../filters/faceon';
import { sceneFit, type Scene } from '../filters/scenes';
import { TextureBank, type Img, type Load } from './textureBank';

type Film = (src: string, ready: (el: HTMLVideoElement) => void) => HTMLVideoElement;
const makeVideo: Film = (src, ready) => {
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.addEventListener('loadeddata', () => ready(v), { once: true });
  v.src = src;
  return v;
};

export function backdropUniforms(cam: THREE.Texture): Record<string, THREE.IUniform> {
  return {
    uTex: { value: cam }, uMask: { value: null }, uPlate: { value: null }, uFar: { value: null }, uNear: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) }, uFit: { value: new THREE.Vector2(1, 1) },
    uOn: { value: 0 }, uHasFar: { value: 0 }, uHasNear: { value: 0 }, uTime: { value: 0 }, uDrift: { value: 0 }, uSway: { value: 0 },
  };
}

// First render pass, camera quad (backdrop.frag): the person over a scene, a layer of the scene over the person.
export class BackdropLayer {
  private bank: TextureBank;
  private films = new Map<string, { el: HTMLVideoElement; tex: THREE.VideoTexture | null }>();
  private mask: THREE.DataTexture | null = null;
  private fresh = false; // a mask arrived since the scene went on
  private playing: HTMLVideoElement | null = null;

  constructor(private mat: THREE.ShaderMaterial, load?: Load, private film: Film = makeVideo) { this.bank = new TextureBank(load); }

  private plain<T extends THREE.Texture>(t: T): T {
    t.colorSpace = THREE.NoColorSpace; // values go through as they are
    t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  }

  private video(src: string) {
    let f = this.films.get(src);
    if (!f) {
      const made = { el: null as unknown as HTMLVideoElement, tex: null as THREE.VideoTexture | null };
      made.el = this.film(src, (el) => { made.tex = this.plain(new THREE.VideoTexture(el)); });
      this.films.set(src, (f = made));
    }
    return f;
  }

  private play(el: HTMLVideoElement | null): void {
    if (this.playing === el) return;
    this.playing?.pause();
    this.playing = el;
    el?.play().catch(() => {}); // a muted video may play without a tap. If not, the plate stays
  }

  setMask(mask: Uint8Array, width: number, height: number): void {
    if (!this.mask || this.mask.image.width !== width || this.mask.image.height !== height) {
      this.mask?.dispose();
      this.mask = this.plain(new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.RedFormat, THREE.UnsignedByteType));
      this.mat.uniforms.uMask.value = this.mask;
      (this.mat.uniforms.uTexel.value as THREE.Vector2).set(1 / width, 1 / height);
    }
    (this.mask.image.data as Uint8Array).set(mask);
    this.mask.needsUpdate = true;
    this.fresh = true;
  }

  // True when the scene is drawn. Until the plate and the first mask are there, the camera picture stays.
  update(scene: Scene | null, mirror: boolean, tMs: number, canvas: [number, number], element: [number, number]): boolean {
    const u = this.mat.uniforms;
    const plate = scene ? this.bank.get(scene.plate) : null;
    const film = scene?.video ? this.video(scene.video) : null;
    const on = !!scene && !!plate && this.fresh;
    u.uOn.value = on ? 1 : 0;
    this.play(on && film?.tex ? film.el : null);
    if (!scene) this.fresh = false; // the next scene waits for a mask of its own time
    if (!scene || !plate || !on) return false;
    const far = scene.far ? this.bank.get(scene.far) : null, near = scene.near ? this.bank.get(scene.near) : null;
    u.uPlate.value = film?.tex ?? plate;
    u.uFar.value = far; u.uHasFar.value = far ? 1 : 0;
    u.uNear.value = near; u.uHasNear.value = near ? 1 : 0;
    u.uDrift.value = scene.drift ?? 0;
    u.uSway.value = scene.sway ?? 0;
    u.uTime.value = tMs / 1000;
    const [w, h] = film?.tex ? [film.el.videoWidth, film.el.videoHeight] : [(plate.image as Img).width, (plate.image as Img).height];
    const [fx, fy] = sceneFit(coverScale(canvas[0], canvas[1], element[0], element[1], w, h), w, h, mirror);
    (u.uFit.value as THREE.Vector2).set(fx, fy);
    return true;
  }

  // The page went to the background: no video runs there. The next update starts it again.
  rest(): void { this.play(null); }

  dispose(): void {
    this.play(null);
    this.bank.dispose();
    this.films.forEach((f) => { f.tex?.dispose(); f.el.removeAttribute('src'); f.el.load(); });
    this.mask?.dispose();
  }
}
