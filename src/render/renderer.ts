import * as THREE from 'three';
import vert from './quad.vert?raw';
import chain from './warpChain.glsl?raw';
import frag from './warp.frag?raw';
import backdropFrag from './backdrop.frag?raw';
import { MAX_HANDLES, type Handle } from '../filters/presets';
import { SpriteLayer } from './spriteLayer';
import { TextLayer, type TextState } from './textLayer';
import type { Sprite } from '../filters/stickers';
import { MakeupLayer } from './makeupLayer';
import { FaceOnLayer, type FaceOnView } from './faceOnLayer';
import { BackdropLayer, backdropUniforms } from './backdropLayer';
import { Props3dLayer } from './props3dLayer';
import type { Placed, Head } from '../filters/props3d';
import type { Scene, View } from '../filters/scenes';
import { coverCrop } from '../capture/snapshot';
import type { LookId } from '../filters/makeup';
import type { Face } from '../tracking/faceTracker';

const MAX_H = MAX_HANDLES; // must equal MAX_H in warpChain.glsl (a test checks it)

export class FaceRenderer {
  private renderer: THREE.WebGLRenderer;
  // Two passes, so stickers follow the warp (operator, 2026-09-27):
  // 1. pre: the camera picture (over a scene, when one is on), the makeup on the face mesh, then the stickers,
  //    into a texture. Unmirrored, unwarped. The 3D props are drawn over that, with a depth buffer of their own.
  // 2. scene: that texture through the warp shader (which also mirrors), then the text on top.
  //    Face-on mode: a picture takes the place of the warped camera view, with the live eyes and mouth on it.
  private pre = new THREE.Scene();
  private target: THREE.WebGLRenderTarget;
  private copy: THREE.ShaderMaterial;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private tex: THREE.VideoTexture;
  private mat: THREE.ShaderMaterial;
  private sprites: SpriteLayer;
  private makeup: MakeupLayer;
  private quad: THREE.Mesh;
  private faceOn: FaceOnLayer;
  private view: FaceOnView | null = null;
  private backdrop: BackdropLayer;
  private props: Props3dLayer;
  private placed: Placed[] = [];
  private heads: Head[] = [];
  private place: Scene | null = null;
  private time = 0;
  private look: LookId = 'none';
  private faces: Face[] = [];
  private spriteList: Sprite[] = [];
  private mirror = true;
  private textLayer: TextLayer;
  private textState: TextState | null = null;

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.tex = new THREE.VideoTexture(video);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // No colour space on the target: both passes copy values as they are, so the picture keeps its colours.
    this.target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace }); // depth: for the 3D props only, the flat layers do not test it
    this.copy = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: backdropFrag, uniforms: backdropUniforms(this.tex), depthTest: false, depthWrite: false });
    this.backdrop = new BackdropLayer(this.copy);
    this.props = new Props3dLayer();
    this.pre.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copy));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: chain + frag,
      uniforms: {
        uTex: { value: this.target.texture },
        uAspect: { value: 16 / 9 },
        uMirror: { value: true },
        uCount: { value: 0 },
        uHandle: { value: Array.from({ length: MAX_H }, () => new THREE.Vector4()) },
        uType: { value: Array.from({ length: MAX_H }, () => 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(this.quad);
    this.faceOn = new FaceOnLayer(this.scene, this.mat.uniforms);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.makeup = new MakeupLayer(this.pre, this.tex);
    this.sprites = new SpriteLayer(this.pre);
    this.textLayer = new TextLayer(this.scene);
  }

  setMirror(on: boolean): void { this.mirror = on; this.mat.uniforms.uMirror.value = on; }

  setSprites(s: Sprite[]): void { this.spriteList = s; }

  setMakeup(id: LookId, faces: Face[]): void { this.look = id; this.faces = faces; }

  setFaceOn(view: FaceOnView | null): void { this.view = view; }

  // 3D props on the heads (src/filters/props3d.ts gives the places)
  // The 3D props that the last frame drew (for scripts/smoke.mjs)
  shown3d(): string[] { return this.props.shown; }
  // on: a prop is chosen. With no face in the picture there is nothing to place, and the choice is still on.
  setProps3d(placed: Placed[], heads: Head[], tMs: number, on = placed.length > 0): void { this.placed = placed; this.heads = heads; this.time3d = tMs; this.propsOn = on; }

  // A place behind the person. The mask says where the person is (segTracker.ts).
  setScene(scene: Scene | null, tMs: number): boolean { this.place = scene; this.time = tMs; return this.sceneOn; }
  setMask(mask: Uint8Array, width: number, height: number): void { this.backdrop.setMask(mask, width, height); }
  rest(): void { this.backdrop.rest(); }
  private sceneOn = false;
  private time3d = 0;
  private propsOn = false;
  private seen: View = { x0: 0, x1: 1, y0: 0, y1: 1 };

  // The part of the camera picture that the screen shows (the stage is shown with object-fit: cover). From the last frame.
  visible(): View { return this.seen; }

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
      this.target.setSize(w, hgt);
      this.mat.uniforms.uAspect.value = w / hgt;
    }
  }

  render(): void {
    this.resize();
    this.sprites.update(this.spriteList, this.mirror, this.mat.uniforms.uAspect.value as number);
    this.makeup.update(this.look, this.faces, this.canvas.width, this.canvas.height);
    const el = this.canvas.getBoundingClientRect();
    const crop = coverCrop(this.canvas.width, this.canvas.height, el.width, el.height);
    this.seen = { x0: crop.x / this.canvas.width, x1: (crop.x + crop.w) / this.canvas.width, y0: crop.y / this.canvas.height, y1: (crop.y + crop.h) / this.canvas.height };
    this.textLayer.update(this.textState, this.mat.uniforms.uAspect.value as number, el.width > 0 ? el.width / el.height : 16 / 9);
    this.sceneOn = this.backdrop.update(this.place, this.mirror, this.time, [this.canvas.width, this.canvas.height], [el.width, el.height]);
    // Smooth edges for the 3D props: 4 samples, only while a prop is chosen. Measured: the picture without a
    // prop is the same bit for bit with and without samples. Three builds the target again after dispose().
    // The choice decides, not the faces: a child that leaves the picture and comes back builds nothing new.
    const samples = this.propsOn ? 4 : 0;
    if (this.target.samples !== samples) { this.target.samples = samples; this.target.dispose(); }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.pre, this.camera);
    if (this.props.update(this.placed, this.heads, this.mat.uniforms.uAspect.value as number, this.time3d)) {
      this.renderer.autoClear = false; // over the picture that is there
      this.renderer.clearDepth();
      this.renderer.render(this.props.scene, this.props.camera);
      this.renderer.autoClear = true;
    }
    this.quad.visible = !this.faceOn.update(this.view, [this.canvas.width, this.canvas.height], [el.width, el.height]);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.textLayer.dispose(); this.props.dispose(); this.backdrop.dispose(); this.faceOn.dispose(); this.makeup.dispose(); this.sprites.dispose(); this.tex.dispose(); this.mat.dispose(); this.copy.dispose(); this.target.dispose(); this.renderer.dispose(); }
}
