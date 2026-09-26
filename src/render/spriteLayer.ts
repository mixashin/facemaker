import * as THREE from 'three';
import { emojiFile, type Sprite } from '../filters/stickers';

const TEX_SIZE = 256;

// Image coords (0..1, y down) to NDC. Mirror flips x for the front camera display.
export function spriteTransform(s: Sprite, mirror: boolean, aspect: number) {
  const x = mirror ? 1 - s.cx : s.cx;
  return {
    x: x * 2 - 1,
    y: 1 - s.cy * 2,
    sx: s.size * 2,
    sy: s.size * 2 * aspect, // size is a fraction of the width; height in NDC scales by W/H
    rot: mirror ? s.angle : -s.angle,
  };
}

export class SpriteLayer {
  private pool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private textures = new Map<string, THREE.Texture | null>(); // null while the image loads
  private geo = new THREE.PlaneGeometry(1, 1);

  constructor(private scene: THREE.Scene) {}

  private texture(emoji: string): THREE.Texture | null {
    if (this.textures.has(emoji)) return this.textures.get(emoji)!;
    this.textures.set(emoji, null);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = TEX_SIZE;
      c.getContext('2d')!.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(emoji, tex);
    };
    img.onerror = () => console.warn('sticker failed to load', emoji);
    img.src = emojiFile(emoji);
    return null;
  }

  private mesh(i: number) {
    while (this.pool.length <= i) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      m.renderOrder = 1; // after the video quad
      m.visible = false;
      this.scene.add(m);
      this.pool.push(m);
    }
    return this.pool[i];
  }

  update(sprites: Sprite[], mirror: boolean, aspect: number): void {
    let n = 0;
    for (const s of sprites) {
      const tex = this.texture(s.emoji);
      if (!tex) continue;
      const m = this.mesh(n++);
      if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
      const t = spriteTransform(s, mirror, aspect);
      m.position.set(t.x, t.y, 0);
      m.scale.set(t.sx, t.sy, 1);
      m.rotation.z = t.rot;
      m.visible = true;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  dispose(): void {
    this.textures.forEach((t) => t?.dispose());
    this.pool.forEach((m) => { m.material.dispose(); this.scene.remove(m); });
    this.geo.dispose();
  }
}
