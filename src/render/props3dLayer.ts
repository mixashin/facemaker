import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OCCLUDERS, type Placed, type Head } from '../filters/props3d';

export type Model = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
export type LoadModel = (file: string, done: (m: Model) => void, fail: () => void) => void;
const RETRY_MS = 5000;

export const loadGlb: LoadModel = (file, done, fail) => {
  new GLTFLoader().load(file, (g) => done({ scene: g.scene, clips: g.animations }), undefined, (e) => { console.warn('model failed to load', file, e); fail(); });
};

// The colours of the parts of a costume are made brighter by this, so that a part that faces the viewer shows
// its own colour: the nose of the witch has the colour of the paint around it. The lights stay as they are:
// stronger lights made the bright parts of the plain props lose their form.
export const COSTUME_GAIN = 1.35;

// The first render pass holds values as the camera gives them (sRGB values, no colour space on the target).
// A lit material gives linear values: write them as sRGB here, so a prop is as bright as the picture.
// gain: a factor for the colours of the materials.
export function likeTheCamera(root: THREE.Object3D, gain = 1): void {
  const done = new Set<THREE.Material>(); // meshes share materials: every material one time
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(m)) continue;
      done.add(m);
      m.toneMapped = false;
      if (gain !== 1 && (m as THREE.MeshStandardMaterial).color) (m as THREE.MeshStandardMaterial).color.multiplyScalar(gain);
      m.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', 'gl_FragColor = sRGBTransferOETF( gl_FragColor );'); };
      m.needsUpdate = true;
    }
  });
}

// The light of every 3D prop, on the camera and in the photo editor. No surface gets more light than its own
// colour holds (light over pi is below one), so bright parts keep their form.
export function lights(): THREE.Light[] {
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(0.4, 1, 2);
  return [new THREE.HemisphereLight(0xffffff, 0x9090b0, 1.3), sun];
}

type Instance = { root: THREE.Group; mixer: THREE.AnimationMixer | null; playing: string | null; clips: THREE.AnimationClip[] };

// 3D props in the first render pass, after the camera picture, the makeup and the stickers: the warp pass
// bends them with the face. Stage space, no perspective (src/filters/props3d.ts).
export class Props3dLayer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  shown: string[] = []; // what the last update draws: a prop that still loads is not in it
  private models = new Map<string, Model | null>(); // null while the model loads
  private failed = new Map<string, number>();
  private pool = new Map<string, Instance>();
  private heads: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private ball = new THREE.SphereGeometry(1, 24, 16);
  private hidden = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });

  constructor(private load: LoadModel = loadGlb, private now: () => number = () => performance.now()) {
    this.scene.add(...lights());
  }

  private model(file: string): Model | null {
    if (this.models.has(file)) return this.models.get(file)!;
    const at = this.failed.get(file);
    if (at !== undefined && this.now() - at < RETRY_MS) return null;
    this.failed.delete(file);
    this.models.set(file, null);
    this.load(file, (m) => { likeTheCamera(m.scene, file.startsWith('/costumes/') ? COSTUME_GAIN : 1); this.models.set(file, m); }, () => { this.models.delete(file); this.failed.set(file, this.now()); });
    return null;
  }

  private instance(key: string, m: Model): Instance {
    let inst = this.pool.get(key);
    if (!inst) {
      const root = new THREE.Group();
      root.name = key;
      root.add(m.scene.clone(true));
      inst = { root, mixer: m.clips.length ? new THREE.AnimationMixer(root) : null, playing: null, clips: m.clips };
      this.scene.add(root);
      this.pool.set(key, inst);
    }
    return inst;
  }

  // Shape n of head i
  private head(i: number) {
    while (this.heads.length <= i) {
      const h = new THREE.Mesh(this.ball, this.hidden);
      h.name = 'head' + this.heads.length;
      h.renderOrder = -1; // into the depth buffer before every prop
      this.scene.add(h);
      this.heads.push(h);
    }
    return this.heads[i];
  }

  // True when there is something to draw. The clips run by the time of the frame, so the screen,
  // a photo and a recording show the same.
  update(placed: Placed[], heads: Head[], aspect: number, tMs: number): boolean {
    if (this.camera.top !== 1 / aspect) { this.camera.top = 1 / aspect; this.camera.bottom = -1 / aspect; this.camera.updateProjectionMatrix(); }
    const on = new Set<string>();
    this.shown = [];
    for (const p of placed) {
      const m = this.model(p.file);
      if (!m) continue;
      const key = `prop:${p.id}#${p.face}`;
      const inst = this.instance(key, m);
      on.add(key);
      this.shown.push(p.id);
      inst.root.visible = true;
      inst.root.position.fromArray(p.pos);
      inst.root.quaternion.fromArray(p.quat);
      inst.root.scale.setScalar(p.scale);
      if (inst.mixer && p.clip && inst.playing !== p.clip) {
        inst.mixer.stopAllAction();
        const clip = THREE.AnimationClip.findByName(inst.clips, p.clip);
        if (clip) inst.mixer.clipAction(clip).play();
        inst.playing = p.clip;
      }
      inst.mixer?.setTime(tMs / 1000);
    }
    for (const [key, inst] of this.pool) if (!on.has(key)) inst.root.visible = false;
    const draw = on.size > 0;
    const n = OCCLUDERS.length;
    heads.forEach((h, i) => OCCLUDERS.forEach((shape, k) => {
      const o = this.head(i * n + k), w = h.width;
      o.visible = draw;
      o.position.set(0, shape.up * w, -shape.back * w).applyQuaternion(h.quat).add(h.centre);
      o.quaternion.copy(h.quat);
      o.scale.set(shape.radii[0] * w, shape.radii[1] * w, shape.radii[2] * w);
    }));
    for (let i = heads.length * n; i < this.heads.length; i++) this.heads[i].visible = false;
    return draw;
  }

  dispose(): void {
    this.ball.dispose();
    this.hidden.dispose();
    this.models.forEach((m) => m?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.dispose();
    }));
    this.pool.clear();
    this.scene.clear();
  }
}
