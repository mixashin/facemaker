import { useEffect, useRef, useState } from 'preact/hooks';
import { screen, store, current, refreshGallery } from './state';
import { safePut } from '../storage/gallery';
import { shareOrDownload } from '../capture/share';
import { EDITOR_STICKERS, elementToImage, hitTest, moveTo, pinch, renderEditor, type EditorSticker, type P } from '../editor/editor';
import { t } from '../i18n/i18n';

const cache = new Map<string, HTMLImageElement>();
function load(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit && hit.complete) return Promise.resolve(hit);
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; cache.set(src, img); });
}

export function Editor() {
  const name = current.value!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [stickers, setStickers] = useState<EditorSticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [images, setImages] = useState(new Map<string, CanvasImageSource>());
  const [dock, setDock] = useState(true); // stickers in view on entry, a tap on the photo hides them
  const nextId = useRef(1);
  const pointers = useRef(new Map<number, P>());
  const grabbed = useRef<number | null>(null); // sticker under the first finger
  const gesture = useRef({ moved: false, pinched: false, x: 0, y: 0 });

  useEffect(() => {
    let bmp: ImageBitmap | null = null, gone = false;
    store.value?.get(name).then((b) => b && createImageBitmap(b)).then((b) => { if (!b) return; if (gone) { b.close(); return; } bmp = b; setPhoto(b); }).catch(() => {});
    return () => { gone = true; bmp?.close(); };
  }, [name]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !photo) return;
    renderEditor(c.getContext('2d')!, photo, stickers, images, selected);
  }, [photo, stickers, images, selected]);

  const add = async (src: string) => {
    if (!photo) return;
    const img = await load(src);
    setImages((m) => new Map(m).set(src, img));
    const s: EditorSticker = { id: nextId.current++, src, x: photo.width / 2, y: photo.height / 2, scale: photo.width * 0.25, rot: 0 };
    setStickers((list) => [...list, s]);
    setSelected(s.id);
  };
  const remove = () => { setStickers((list) => list.filter((s) => s.id !== selected)); setSelected(null); };

  const toImage = (e: PointerEvent): P => {
    const c = canvasRef.current!, r = c.getBoundingClientRect();
    return elementToImage(e.clientX - r.left, e.clientY - r.top, c.width, c.height, r.width, r.height);
  };
  // Tap a sticker: selected (glow). One finger on it drags. Two fingers anywhere scale and rotate the selected one.
  // A tap on empty space deselects. Nothing moves without a selection.
  const onDown = (e: PointerEvent) => {
    setDock(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImage(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      const hit = hitTest(stickers, p);
      grabbed.current = hit?.id ?? null;
      if (hit) setSelected(hit.id);
      gesture.current = { moved: false, pinched: false, x: p.x, y: p.y };
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = new Map(pointers.current);
    const p = toImage(e);
    pointers.current.set(e.pointerId, p);
    const ps = [...pointers.current.entries()];
    if (ps.length === 1) {
      if (Math.hypot(p.x - gesture.current.x, p.y - gesture.current.y) > 6) gesture.current.moved = true;
      const id = grabbed.current;
      if (id !== null && gesture.current.moved) setStickers((list) => list.map((s) => (s.id === id ? moveTo(s, p) : s)));
    } else if (ps.length >= 2 && selected !== null) {
      gesture.current.pinched = true;
      const [[ia, a1], [ib, b1]] = ps;
      const a0 = prev.get(ia) ?? a1, b0 = prev.get(ib) ?? b1;
      setStickers((list) => list.map((s) => (s.id === selected ? pinch(s, a0, b0, a1, b1) : s)));
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (grabbed.current === null && !gesture.current.moved && !gesture.current.pinched) setSelected(null); // tap off: end the edit
      grabbed.current = null;
    }
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || !store.value || !photo) return;
    renderEditor(c.getContext('2d')!, photo, stickers, images, null); // the file never carries the glow
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    const file = new File([blob], `facemaker-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
    if (!(await safePut(store.value, file.name, file))) await shareOrDownload(file); // full device: still hand it over
    await refreshGallery();
    screen.value = 'gallery';
  };

  return (
    <div class="sheet editor" role="dialog" aria-label={t('editor.title')}>
      <button class="close" aria-label={t('gallery.back')} onClick={() => (screen.value = 'viewer')}>✖</button>
      <canvas ref={canvasRef} class="edit-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <aside class={'dock single' + (dock ? ' open' : '')} aria-label={t('editor.title')}>
        <button class="pull" aria-label="effects" aria-expanded={dock} onClick={() => setDock(!dock)}>{dock ? '◀' : '✨'}</button>
        <div class="dock-body">
          <div class="strip palette" aria-label={t('editor.title')}>
            {EDITOR_STICKERS.map((s) => (
              <button key={s.id} class="chip" aria-label={s.id} onClick={() => add(s.src)}><img src={s.src} alt="" /></button>
            ))}
          </div>
        </div>
      </aside>
      <div class="bar editbar">
        <button class="round" aria-label={t('editor.remove')} disabled={selected === null} onClick={remove}>🧹</button>
        <button class="round shutter save" aria-label={t('editor.save')} onClick={save}>💾</button>
        <span class="round spacer" />
      </div>
    </div>
  );
}
