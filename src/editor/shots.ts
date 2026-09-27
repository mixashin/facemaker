// Pictures of stickers that are turned in depth, for the photo editor (operator, 2026-09-27): a 3D prop, or a
// flat sticker that tilts like a card. One small WebGL renderer of its own draws the sticker, the editor puts
// that picture on the photo with the 2D canvas. The turn in the plane and the mirror stay with the 2D canvas.
import * as THREE from 'three';
import { loadGlb, lights, brighten, COSTUME_GAIN, type LoadModel } from '../render/props3dLayer';
import { prop3dById, OCCLUDERS } from '../filters/props3d';
import { partById } from '../filters/costumes';
import { FRAME, type EditorSticker } from './editor';

const FOV = 30; // degrees. A mild perspective: the near side of a tilted card is larger, so the tilt shows.
const CARD_PX = 512;

// Yaw first, around the line that stands in the sticker. Then pitch, around the line that lies on the screen.
export function turn(yaw: number, pitch: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'XYZ'));
}

// Side of the shot in pixels, for a shot that is `px` wide on the photo. The limit: the hat of a costume at the
// size of a head on a phone photo needs about 1800 px.
export function shotSize(px: number): number {
  let n = 128;
  while (n < 2048 && n < px) n *= 2;
  return n;
}

// Width and height of a flat sticker in units: the long side is one unit
export function cardSize(w: number, h: number): [number, number] {
  const long = Math.max(w, h);
  return long > 0 ? [w / long, h / long] : [1, 1];
}

export type ShotRenderer = Pick<THREE.WebGLRenderer, 'domElement' | 'setSize' | 'render' | 'dispose' | 'forceContextLoss'>;
const webgl = (): ShotRenderer => {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  r.setClearColor(0x000000, 0);
  return r;
};

export class Shots {
  private renderer: ShotRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  private things = new Map<string, THREE.Object3D>(); // key: 'model:<id>' or the src of a flat sticker
  private waiting = new Map<string, Promise<boolean>>();
  private broken = false;

  constructor(private load: LoadModel = loadGlb, private make: () => ShotRenderer | null = webgl) {
    this.scene.add(...lights());
    // At the distance of the sticker the picture shows FRAME units to every side
    this.camera.position.z = FRAME / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  }

  private gl(): ShotRenderer | null {
    if (this.renderer || this.broken) return this.renderer;
    try { this.renderer = this.make(); } catch (e) { console.warn('no 3D renderer for the editor', e); }
    this.broken = !this.renderer;
    return this.renderer;
  }

  private keep(key: string, thing: THREE.Object3D): void {
    const pivot = new THREE.Group();
    pivot.add(thing);
    pivot.visible = false;
    this.things.set(key, pivot);
    this.scene.add(pivot);
  }

  // Resolves to true when the prop is ready to draw. False with no 3D renderer: a sticker that nobody can
  // see must not come onto the photo.
  model(id: string): Promise<boolean> {
    const key = 'model:' + id, part = partById(id), def = prop3dById(id) ?? part;
    if (!def || !this.gl()) return Promise.resolve(false);
    if (this.things.has(key)) return Promise.resolve(true);
    let p = this.waiting.get(key);
    if (!p) {
      p = new Promise<boolean>((res) => this.load(def.file, (m) => {
        // The origin of a prop is the point that touches the head. In the editor the prop turns around its middle.
        const box = new THREE.Box3().setFromObject(m.scene), mid = box.getCenter(new THREE.Vector3());
        m.scene.position.sub(mid);
        // A part of a costume is made around a head, and one unit is the face width there: the hat of the witch
        // is three units high. Its long side becomes one unit, as the long side of a prop is. Its colours are
        // those that it has on the live camera.
        if (part) {
          const size = box.getSize(new THREE.Vector3()), k = 1 / (Math.max(size.x, size.y, size.z) || 1);
          m.scene.position.multiplyScalar(k); m.scene.scale.multiplyScalar(k);
          brighten(m.scene, COSTUME_GAIN);
          // A part that goes around the head (the hat with its hair) has hair behind the head. The live camera
          // hides it behind the hidden shapes of the head. Here the same shapes go into the part, in its frame:
          // they write depth and no colour, so the head of the photo shows where they are. A part in front of
          // the face (the nose) gets none: it would go away when the child turns it round.
          if (box.min.z < 0) for (const shape of OCCLUDERS) {
            const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
            head.position.set(0, shape.up, -shape.back);
            head.scale.set(...shape.radii);
            head.renderOrder = -1; // into the depth buffer before the part
            m.scene.add(head);
          }
        }
        this.keep(key, m.scene);
        this.waiting.delete(key);
        res(true);
      }, () => { this.waiting.delete(key); res(false); }));
      this.waiting.set(key, p);
    }
    return p;
  }

  // A flat sticker as a card. The picture goes through a canvas: an SVG file can have no size of its own.
  card(src: string, img: CanvasImageSource, w: number, h: number): void {
    if (this.things.has(src)) return;
    const [cw, ch] = cardSize(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * CARD_PX)); c.height = Math.max(1, Math.round(ch * CARD_PX));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    this.keep(src, new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false })));
  }

  // The picture of the sticker as it is turned now, or null. It holds until the next draw: use it at once.
  draw = (s: EditorSticker): CanvasImageSource | null => {
    const thing = this.things.get(s.model ? 'model:' + s.model : s.src), gl = thing && this.gl();
    if (!thing || !gl) return null;
    const n = shotSize(s.scale * 2 * FRAME);
    if (gl.domElement.width < n || gl.domElement.width !== gl.domElement.height) gl.setSize(n, n, false); // it only grows: two stickers of two sizes would build it new for every draw
    for (const t of this.things.values()) t.visible = t === thing;
    thing.quaternion.copy(turn(s.flip ? -(s.yaw ?? 0) : s.yaw ?? 0, s.pitch ?? 0)); // the canvas mirrors the picture: the turn goes the other way there
    gl.render(this.scene, this.camera);
    return gl.domElement;
  };

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    });
    this.things.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss(); // a phone has few WebGL contexts: give this one back
    this.renderer = null;
  }
}
