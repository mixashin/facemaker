import * as THREE from 'three';

// Pictures as textures, by address. The layers take the loader as a parameter, so tests run without a browser.
export type Img = TexImageSource & { width: number; height: number };
export type Load = (src: string, done: (img: Img) => void, fail: () => void) => void;
const RETRY_MS = 5000;

export const loadImage: Load = (src, done, fail) => {
  const img = new Image();
  img.onload = () => done(img);
  img.onerror = () => { console.warn('picture failed to load', src); fail(); };
  img.src = src;
};

export class TextureBank {
  private textures = new Map<string, THREE.Texture | null>(); // null while the picture loads
  private failed = new Map<string, number>(); // when a picture failed to load

  constructor(private load: Load = loadImage, private now: () => number = () => performance.now()) {}

  // The texture, or null while the picture is on its way. Ask every frame: the picture is loaded once.
  get(src: string): THREE.Texture | null {
    if (this.textures.has(src)) return this.textures.get(src)!;
    const at = this.failed.get(src);
    if (at !== undefined && this.now() - at < RETRY_MS) return null; // the phone was offline for a moment: ask again, but not every frame
    this.failed.delete(src);
    this.textures.set(src, null);
    // One device photo at a time: a new one takes the place of the one before (each is a large texture).
    if (src.startsWith('blob:')) for (const [old, tex] of this.textures) if (old !== src && old.startsWith('blob:')) { tex?.dispose(); this.textures.delete(old); }
    this.load(src, (img) => {
      if (!this.textures.has(src)) return; // replaced while it loaded
      const t = new THREE.Texture(img as never);
      t.colorSpace = THREE.NoColorSpace; // values go through as they are
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      this.textures.set(src, t);
    }, () => { this.textures.delete(src); this.failed.set(src, this.now()); });
    return null;
  }

  dispose(): void {
    this.textures.forEach((t) => t?.dispose());
    this.textures.clear();
  }
}
