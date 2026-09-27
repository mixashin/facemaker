import * as THREE from 'three';
import type { Sprite } from '../filters/stickers';

const TEX_SIZE = 256;

// Image coords (0..1, y down) to the sprite group's space. The group is scaled by (1, aspect), so one unit
// is W/2 px on both axes there: a rotation in that space is a rotation in pixels.
// Sprites are drawn into the camera picture (unmirrored), before the warp. The renderer warps and mirrors
// the picture with its stickers as one, so the mirror does not move a sprite here. It only flips the art,
// so that the art reads the right way round after the mirror.
export function spriteTransform(s: Sprite, mirror: boolean, aspect: number) {
  return {
    x: s.cx * 2 - 1,
    y: (1 - s.cy * 2) / aspect,
    s: s.size * 2, // uniform: size is a fraction of the width
    rot: -s.angle,
    flip: mirror,
  };
}

export class SpriteLayer {
  private pool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private textures = new Map<string, THREE.Texture | null>(); // null while the image loads
  private geo = new THREE.PlaneGeometry(1, 1);
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) { scene.add(this.group); }

  private texture(src: string): THREE.Texture | null {
    if (this.textures.has(src)) return this.textures.get(src)!;
    this.textures.set(src, null);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = TEX_SIZE;
      c.getContext('2d')!.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.NoColorSpace; // values go through as they are, like the camera picture (renderer.ts)
      this.textures.set(src, tex);
    };
    img.onerror = () => console.warn('sticker failed to load', src);
    img.src = src;
    return null;
  }

  private mesh(i: number) {
    while (this.pool.length <= i) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.renderOrder = 1; // after the video quad
      m.visible = false;
      this.group.add(m);
      this.pool.push(m);
    }
    return this.pool[i];
  }

  update(sprites: Sprite[], mirror: boolean, aspect: number): void {
    this.group.scale.set(1, aspect, 1);
    let n = 0;
    for (const s of sprites) {
      const tex = this.texture(s.src);
      if (!tex) continue;
      const m = this.mesh(n++);
      if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
      const t = spriteTransform(s, mirror, aspect);
      m.position.set(t.x, t.y, 0);
      m.scale.set(t.flip ? -t.s : t.s, t.s, 1);
      m.rotation.z = t.rot;
      m.visible = true;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  dispose(): void {
    this.textures.forEach((t) => t?.dispose());
    this.pool.forEach((m) => { m.material.dispose(); this.group.remove(m); });
    this.scene.remove(this.group);
    this.geo.dispose();
  }
}
