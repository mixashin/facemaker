import * as THREE from 'three';
import vert from './quad.vert?raw';
import frag from './warp.frag?raw';
import type { Handle } from '../filters/presets';
import { SpriteLayer } from './spriteLayer';
import { TextLayer, type TextState } from './textLayer';
import type { Sprite } from '../filters/stickers';

const MAX_H = 16;

export class FaceRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private tex: THREE.VideoTexture;
  private mat: THREE.ShaderMaterial;
  private sprites: SpriteLayer;
  private spriteList: Sprite[] = [];
  private mirror = true;
  private textLayer: TextLayer;
  private textState: TextState | null = null;

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.tex = new THREE.VideoTexture(video);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTex: { value: this.tex },
        uAspect: { value: 16 / 9 },
        uMirror: { value: true },
        uCount: { value: 0 },
        uHandle: { value: Array.from({ length: MAX_H }, () => new THREE.Vector4()) },
        uType: { value: Array.from({ length: MAX_H }, () => 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.sprites = new SpriteLayer(this.scene);
    this.textLayer = new TextLayer(this.scene);
  }

  setMirror(on: boolean): void { this.mirror = on; this.mat.uniforms.uMirror.value = on; }

  setSprites(s: Sprite[]): void { this.spriteList = s; }

  setText(s: TextState | null): void { this.textState = s; }

  setHandles(h: Handle[]): void {
    const n = Math.min(h.length, MAX_H);
    const arr = this.mat.uniforms.uHandle.value as THREE.Vector4[];
    const types = this.mat.uniforms.uType.value as number[];
    for (let i = 0; i < n; i++) { arr[i].set(h[i].cx, h[i].cy, h[i].r, h[i].strength); types[i] = h[i].type; }
    this.mat.uniforms.uCount.value = n;
  }

  resize(): void {
    const w = this.video.videoWidth || 1280, hgt = this.video.videoHeight || 720;
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.renderer.setSize(w, hgt, false);
      this.mat.uniforms.uAspect.value = w / hgt;
    }
  }

  render(): void {
    this.resize();
    this.sprites.update(this.spriteList, this.mirror, this.mat.uniforms.uAspect.value as number);
    const el = this.canvas.getBoundingClientRect();
    this.textLayer.update(this.textState, this.mat.uniforms.uAspect.value as number, el.width > 0 ? el.width / el.height : 16 / 9);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.textLayer.dispose(); this.sprites.dispose(); this.tex.dispose(); this.mat.dispose(); this.renderer.dispose(); }
}
