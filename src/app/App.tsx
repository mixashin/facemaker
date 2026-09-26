import { useEffect, useRef } from 'preact/hooks';
import { startCamera, stopCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesFor } from '../filters/presets';
import { spritesFor } from '../filters/stickers';
import { snapshot } from '../capture/snapshot';
import { shareOrDownload } from '../capture/share';
import { Dock } from './Dock';
import { Tutorial } from './Tutorial';
import { Settings } from './Settings';
import { About } from './About';
import { shouldShowTutorial } from './tutorialState';
import { textVisible } from '../render/textLayer';
import { Gallery } from './Gallery';
import { Viewer } from './Viewer';
import { Editor } from './Editor';
import { openStore, safePut } from '../storage/gallery';
import { sliderHandles } from '../filters/sliders';
import { TopBar } from './TopBar';
import { CaptureButton } from './CaptureButton';
import { preset, facing, camState, flash, busy, dockOpen, sticker, text, tutorialSeen, showSettings, showAbout, screen, store, items, refreshGallery, sliders, galleryThumb, flyShot, camStateFromError } from './state';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    openStore().then((s) => { store.value = s; return refreshGallery(); }).then(() => {
      const newest = items.value[0];
      if (newest && !galleryThumb.value) store.value?.thumb(newest.name).then((b) => { if (b) galleryThumb.value = URL.createObjectURL(b); }).catch(() => {});
    }).catch(() => {});
    const video = videoRef.current!, canvas = canvasRef.current!;
    let faces: Face[] = [];
    let raf = 0;
    const r = new FaceRenderer(canvas, video);
    // Debug counters for scripts/smoke.mjs: frames returned by the worker and faces in the last one.
    const fm = ((globalThis as any).__fm = { frames: 0, faces: 0, delegate: '', shots: 0 });
    const t = new FaceTracker({
      numFaces: 2,
      onFaces: (f) => { faces = f; fm.frames++; fm.faces = f.length; },
      onReady: (d) => { fm.delegate = d; },
      onError: (m) => console.error('tracker', m),
    });
    const loop = (now: number) => {
      if (screen.value === 'camera') t.push(video, now);
      const aspect = video.videoWidth / video.videoHeight;
      r.setHandles([...handlesFor(preset.value, faces, aspect), ...sliderHandles(sliders.value, faces, aspect, now)]);
      r.setSprites(spritesFor(sticker.value, faces, aspect));
      r.setText(text.value);
      r.render();
      raf = requestAnimationFrame(loop);
    };
    let started = false;
    const start = () => {
      camState.value = 'starting';
      startCamera(video, facing.value)
        .then(() => {
          camState.value = 'live';
          r.setMirror(facing.value === 'user');
          if (!started) { t.start(); started = true; raf = requestAnimationFrame(loop); }
        })
        .catch((e) => { camState.value = camStateFromError((e as DOMException)?.name ?? ''); });
    };
    start();
    // subscribe fires once immediately. Skip that first run, restart the camera on real changes.
    let first = true;
    const unsub = facing.subscribe(() => { if (first) { first = false; return; } start(); });
    return () => { unsub(); cancelAnimationFrame(raf); t.stop(); r.dispose(); stopCamera(video); };
  }, []);

  const capture = async () => {
    if (busy.value || camState.value !== 'live') return; // kids double tap
    busy.value = true;
    flash.value = true;
    setTimeout(() => (flash.value = false), 120);
    try {
      const rect = canvasRef.current!.getBoundingClientRect();
      const file = await snapshot(canvasRef.current!, 0.92, { width: rect.width, height: rect.height }); // what the screen shows
      const saved = !!store.value && (await safePut(store.value, file.name, file));
      if (saved) {
        (globalThis as any).__fm.shots++;
        const url = URL.createObjectURL(file);
        flyShot.value = url; // the photo flies into the gallery button
        setTimeout(() => { flyShot.value = null; if (galleryThumb.value) URL.revokeObjectURL(galleryThumb.value); galleryThumb.value = url; }, 700);
        store.value!.thumb(file.name).catch(() => {});
        refreshGallery().catch(() => {});
      } else {
        await shareOrDownload(file); // no device storage: hand the photo over directly
      }
    } catch (e) {
      console.error('capture', e);
    } finally {
      setTimeout(() => (busy.value = false), 500); // lockout: a fast double tap makes one photo, not two
    }
  };

  const retry = () => location.reload();

  // Text drag (one pointer) and pinch scale (two pointers) on the stage.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, scale0 = 1;
  let down = { x: 0, y: 0, moved: false }; // tap (no move) closes the open strip, drag moves the text
  const norm = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const onDown = (e: PointerEvent) => {
    if (!textVisible(text.value)) { dockOpen.value = false; return; } // nothing to drag: a tap on the video closes the dock
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = norm(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) down = { x: p.x, y: p.y, moved: false };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = text.value.scale; }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, norm(e));
    if (pointers.size === 1) {
      const p = norm(e);
      if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 0.01) down.moved = true;
      if (down.moved) text.value = { ...text.value, x: p.x, y: p.y };
    }
    else if (pointers.size === 2 && pinch0 > 0) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); text.value = { ...text.value, scale: Math.min(3, Math.max(0.3, scale0 * d / pinch0)) }; }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && !down.moved && pinch0 === 0) dockOpen.value = false; // a plain tap closes the dock
    if (pointers.size < 2) pinch0 = 0;
  };

  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {flash.value && <div class="flash" />}
      {flyShot.value && <img class="fly" src={flyShot.value} alt="" />}
      {camState.value === 'live' && (
        <>
          <TopBar />
          {screen.value === 'camera' && <Dock />}
          <CaptureButton onCapture={capture} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} onGallery={() => { dockOpen.value = false; refreshGallery().catch(() => {}); screen.value = 'gallery'; }} />
        </>
      )}
      {shouldShowTutorial(tutorialSeen.value, camState.value) && <Tutorial />}
      {showSettings.value && <Settings />}
      {showAbout.value && <About />}
      {screen.value === 'gallery' && <Gallery />}
      {screen.value === 'viewer' && <Viewer />}
      {screen.value === 'editor' && <Editor />}
      {(camState.value === 'denied' || camState.value === 'nocam' || camState.value === 'error') && (
        <button class="blocker" onClick={retry} aria-label="retry camera">
          <span class="big">{camState.value === 'denied' ? '🔒📷' : camState.value === 'nocam' ? '🚫📷' : '⚠️📷'}</span>
          <span class="big">🔁</span>
        </button>
      )}
    </main>
  );
}
