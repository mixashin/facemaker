import * as THREE from 'three';

export type TextState = { text: string; color: string; font: 'a' | 'b'; x: number; y: number; scale: number };
export const TEXT_COLORS = ['#ffffff', '#ffe600', '#ff5fb0', '#3bd1ff', '#5cff7a', '#111111'];
// Font b ends in serif: Impact on Windows, Noto Serif on Android, so the toggle changes the face everywhere.
export const FONTS = { a: 'system-ui, sans-serif', b: 'Impact, "Arial Black", serif' };
const W = 1024, H = 256, MAX_PX = 96;

export function textVisible(s: TextState | null): boolean {
  return !!s && s.text.trim().length > 0;
}

export function fitFontPx(measuredAt96: number, maxWidth: number): number {
  return measuredAt96 <= maxWidth ? MAX_PX : Math.floor((MAX_PX * maxWidth) / measuredAt96);
}

// The canvas is shown with object-fit: cover. Element-normalized coords map to canvas-normalized coords.
export function elementToCanvas(ex: number, ey: number, canvasAspect: number, elementAspect: number): [number, number] {
  if (canvasAspect > elementAspect) return [0.5 + (ex - 0.5) * (elementAspect / canvasAspect), ey];
  return [ex, 0.5 + (ey - 0.5) * (canvasAspect / elementAspect)];
}

export class TextLayer {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private drawn = '';

  constructor(private scene: THREE.Scene) {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 2; // above stickers
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private draw(s: TextState): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.font = `bold ${MAX_PX}px ${FONTS[s.font]}`;
    const px = fitFontPx(c.measureText(s.text).width, W - 40);
    c.font = `bold ${px}px ${FONTS[s.font]}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = Math.max(4, px / 10);
    c.strokeStyle = s.color === '#111111' ? '#ffffff' : '#000000';
    c.fillStyle = s.color;
    c.strokeText(s.text, W / 2, H / 2);
    c.fillText(s.text, W / 2, H / 2);
    this.tex.needsUpdate = true;
  }

  update(s: TextState | null, canvasAspect: number, elementAspect: number): void {
    if (!textVisible(s)) { this.mesh.visible = false; return; }
    const st = s!;
    const key = `${st.text}|${st.color}|${st.font}`;
    if (key !== this.drawn) { this.draw(st); this.drawn = key; }
    const [cx, cy] = elementToCanvas(st.x, st.y, canvasAspect, elementAspect);
    const visibleW = canvasAspect > elementAspect ? elementAspect / canvasAspect : 1; // fraction of the canvas width on screen
    const w = 0.8 * st.scale * visibleW;                                              // plane width as a fraction of the canvas width
    this.mesh.position.set(cx * 2 - 1, 1 - cy * 2, 0);
    this.mesh.scale.set(w * 2, w * 2 * (H / W) * canvasAspect, 1);
    this.mesh.visible = true;
  }

  dispose(): void { this.tex.dispose(); this.mesh.material.dispose(); this.mesh.geometry.dispose(); this.scene.remove(this.mesh); }
}
