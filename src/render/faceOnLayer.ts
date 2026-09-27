import * as THREE from 'three';
import copyFrag from './copy.frag?raw';
import chain from './warpChain.glsl?raw';
import frag from './faceon.frag?raw';
import { SPAN, coverScale, coverOffset, type Frame, type Win, type Target } from '../filters/faceon';
import { TextureBank, type Img, type Load } from './textureBank';

export type FaceOnView = { target: Target; frame: Frame | null; wins: Win[] };

// quad.vert ignores the matrices (the full-screen passes need none). These two meshes have a place.
const PLACED = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Second render pass, face-on mode: the target picture, and on it the live eyes and mouth.
export class FaceOnLayer {
  private group = new THREE.Group(); // one unit is the picture width, on both axes
  private picture: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private face: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private bank: TextureBank;

  constructor(private scene: THREE.Scene, shared: Record<string, THREE.IUniform>, load?: Load, now?: () => number) {
    this.bank = new TextureBank(load, now);
    const geo = new THREE.PlaneGeometry(1, 1);
    this.picture = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: PLACED, fragmentShader: copyFrag, uniforms: { uTex: { value: null } }, depthTest: false, depthWrite: false }));
    this.face = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: PLACED,
      fragmentShader: chain + frag,
      // the filters of the warp shader work here too: same uniform objects, not copies
      uniforms: { ...shared, uNose: { value: new THREE.Vector2() }, uWidth: { value: 1 }, uRoll: { value: 0 }, uSpan: { value: SPAN }, uWin: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uOff: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    this.face.renderOrder = 1; // over the picture, under the text
    this.group.add(this.picture, this.face);
    this.group.visible = false;
    scene.add(this.group);
  }

  // True when the picture is drawn. Until it is loaded the camera view stays.
  update(view: FaceOnView | null, canvas: [number, number], element: [number, number]): boolean {
    const tex = view ? this.bank.get(view.target.img) : null;
    this.group.visible = !!tex;
    if (!view || !tex) return false;
    const img = tex.image as Img, t = view.target, ratio = img.height / img.width;
    const [sx, sy] = coverScale(canvas[0], canvas[1], element[0], element[1], img.width, img.height);
    this.group.scale.set(sx, sy, 1);
    const [gx, gy] = coverOffset(canvas[0], canvas[1], element[0], element[1], img.width, img.height, t.nose);
    this.group.position.set(gx, gy, 0);
    this.picture.material.uniforms.uTex.value = tex;
    this.picture.scale.set(1, ratio, 1);
    this.face.visible = !!view.frame && view.wins.length === 3;
    if (view.frame && this.face.visible) {
      const u = this.face.material.uniforms;
      this.face.position.set(t.nose[0] - 0.5, -(t.nose[1] - 0.5) * ratio, 0);
      this.face.scale.set(SPAN * t.width, SPAN * t.width, 1);
      this.face.rotation.z = -t.angle;
      (u.uNose.value as THREE.Vector2).set(view.frame.nose[0], view.frame.nose[1]);
      u.uWidth.value = view.frame.width;
      u.uRoll.value = view.frame.roll;
      view.wins.forEach((w, i) => { (u.uWin.value as THREE.Vector4[])[i].set(w[0], w[1], w[2], w[3]); (u.uOff.value as THREE.Vector2[])[i].set(w[4], w[5]); });
    }
    return true;
  }

  dispose(): void {
    this.bank.dispose();
    this.picture.geometry.dispose();
    this.picture.material.dispose();
    this.face.material.dispose();
    this.scene.remove(this.group);
  }
}
