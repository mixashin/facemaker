export type GalleryItem = { name: string; created: number; type: 'image' | 'video'; size: number };

const NAME = /^facemaker-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.(jpg|mp4|webm)$/;

export function parseName(name: string): GalleryItem | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms, ext] = m;
  return { name, created: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms), type: ext === 'jpg' ? 'image' : 'video', size: 0 };
}

export interface GalleryStore {
  list(): Promise<GalleryItem[]>;
  put(name: string, blob: Blob): Promise<void>;
  get(name: string): Promise<Blob | null>;
  delete(name: string): Promise<void>;
  clear(): Promise<void>;
  thumb(name: string): Promise<Blob | null>;
  usage(): Promise<{ used: number; quota: number }>;
}

const newestFirst = (a: GalleryItem, b: GalleryItem) => b.created - a.created;

// Browser only: 256 px JPEG thumbnail.
export async function makeThumbJpeg(blob: Blob, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(blob, { resizeWidth: size, resizeQuality: 'medium' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}

export class MemoryStore implements GalleryStore {
  private files = new Map<string, Blob>();
  private thumbs = new Map<string, Blob>();
  constructor(private makeThumb: (b: Blob) => Promise<Blob> = async (b) => b) {}
  async list() {
    const out: GalleryItem[] = [];
    for (const [name, b] of this.files) { const it = parseName(name); if (it) out.push({ ...it, size: b.size }); }
    return out.sort(newestFirst);
  }
  async put(name: string, blob: Blob) { this.files.set(name, blob); this.thumbs.delete(name); }
  async get(name: string) { return this.files.get(name) ?? null; }
  async delete(name: string) { this.files.delete(name); this.thumbs.delete(name); }
  async clear() { this.files.clear(); this.thumbs.clear(); }
  async thumb(name: string) {
    const cached = this.thumbs.get(name);
    if (cached) return cached;
    const b = this.files.get(name);
    if (!b) return null;
    const t = await this.makeThumb(b);
    this.thumbs.set(name, t);
    return t;
  }
  async usage() { let used = 0; for (const b of this.files.values()) used += b.size; return { used, quota: 0 }; }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, blob: Blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

export class OpfsStore implements GalleryStore {
  private constructor(private photos: FileSystemDirectoryHandle, private thumbs: FileSystemDirectoryHandle) {}
  static available(): boolean { return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory; }
  static async open(): Promise<OpfsStore> {
    const root = await navigator.storage.getDirectory();
    return new OpfsStore(await root.getDirectoryHandle('photos', { create: true }), await root.getDirectoryHandle('thumbs', { create: true }));
  }
  async list() {
    const out: GalleryItem[] = [];
    for await (const [name, h] of this.photos.entries()) {
      const it = parseName(name);
      if (it && h.kind === 'file') out.push({ ...it, size: (await (h as FileSystemFileHandle).getFile()).size });
    }
    return out.sort(newestFirst);
  }
  async put(name: string, blob: Blob) { await writeFile(this.photos, name, blob); }
  async get(name: string) { return readFile(this.photos, name); }
  async delete(name: string) {
    await this.photos.removeEntry(name).catch(() => {});
    await this.thumbs.removeEntry(name).catch(() => {});
  }
  async clear() {
    for await (const name of this.photos.keys()) await this.photos.removeEntry(name).catch(() => {});
    for await (const name of this.thumbs.keys()) await this.thumbs.removeEntry(name).catch(() => {});
  }
  async thumb(name: string) {
    const cached = await readFile(this.thumbs, name);
    if (cached) return cached;
    const full = await readFile(this.photos, name);
    if (!full) return null;
    const t = await makeThumbJpeg(full);
    await writeFile(this.thumbs, name, t).catch(() => {});
    return t;
  }
  async usage() {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  }
}

let persistAsked = false;

export async function openStore(): Promise<GalleryStore> {
  if (OpfsStore.available()) {
    try { return await OpfsStore.open(); } catch (e) { console.warn('OPFS unavailable, gallery is session only', e); }
  }
  return new MemoryStore(makeThumbJpeg);
}

// Never lets a storage failure stop the capture flow.
export async function safePut(store: GalleryStore, name: string, blob: Blob): Promise<boolean> {
  try {
    await store.put(name, blob);
    if (!persistAsked && typeof navigator !== 'undefined' && navigator.storage?.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
    return true;
  } catch (e) {
    console.warn('gallery save failed', e);
    return false;
  }
}
