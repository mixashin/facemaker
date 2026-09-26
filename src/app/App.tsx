import { useEffect, useRef } from 'preact/hooks';
import { startCamera, stopCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { PRESETS, handlesFor } from '../filters/presets';
import { STICKER_PACKS, spritesFor } from '../filters/stickers';
import { snapshot } from '../capture/snapshot';
import { shareOrDownload } from '../capture/share';
import { Strip } from './Strip';
import { ModeTabs } from './ModeTabs';
import { TextEditor } from './TextEditor';
import { Tutorial } from './Tutorial';
import { Settings } from './Settings';
import { About } from './About';
import { shouldShowTutorial } from './tutorialState';
import { textVisible } from '../render/textLayer';
import { TopBar } from './TopBar';
import { CaptureButton } from './CaptureButton';
import { preset, facing, camState, flash, busy, mode, sticker, text, tutorialSeen, showSettings, showAbout, camStateFromError } from './state';
import { t } from '../i18n/i18n';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current!, canvas = canvasRef.current!;
    let faces: Face[] = [];
    let raf = 0;
    const r = new FaceRenderer(canvas, video);
    // Debug counters for scripts/smoke.mjs: frames returned by the worker and faces in the last one.
    const fm = ((globalThis as any).__fm = { frames: 0, faces: 0, delegate: '' });
    const t = new FaceTracker({
      numFaces: 2,
      onFaces: (f) => { faces = f; fm.frames++; fm.faces = f.length; },
      onReady: (d) => { fm.delegate = d; },
      onError: (m) => console.error('tracker', m),
    });
    const loop = (now: number) => {
      t.push(video, now);
      r.setHandles(handlesFor(preset.value, faces, video.videoWidth / video.videoHeight));
      r.setSprites(spritesFor(sticker.value, faces, video.videoWidth / video.videoHeight));
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
      await shareOrDownload(await snapshot(canvasRef.current!));
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
  const norm = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const onDown = (e: PointerEvent) => {
    if (!textVisible(text.value)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, norm(e));
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = text.value.scale; }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, norm(e));
    if (pointers.size === 1) { const p = norm(e); text.value = { ...text.value, x: p.x, y: p.y }; }
    else if (pointers.size === 2 && pinch0 > 0) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); text.value = { ...text.value, scale: Math.min(3, Math.max(0.3, scale0 * d / pinch0)) }; }
  };
  const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };

  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {flash.value && <div class="flash" />}
      {camState.value === 'live' && (
        <>
          <TopBar />
          <ModeTabs />
          {mode.value === 'warp' && <Strip items={PRESETS} value={preset.value} onPick={(id) => (preset.value = id as typeof preset.value)} label={t('tabs.warp')} />}
          {mode.value === 'sticker' && <Strip items={STICKER_PACKS} value={sticker.value} onPick={(id) => (sticker.value = id)} label={t('tabs.sticker')} />}
          {mode.value === 'text' && <TextEditor />}
          <CaptureButton onCapture={capture} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} />
        </>
      )}
      {shouldShowTutorial(tutorialSeen.value, camState.value) && <Tutorial />}
      {showSettings.value && <Settings />}
      {showAbout.value && <About />}
      {(camState.value === 'denied' || camState.value === 'nocam' || camState.value === 'error') && (
        <button class="blocker" onClick={retry} aria-label="retry camera">
          <span class="big">{camState.value === 'denied' ? '🔒📷' : camState.value === 'nocam' ? '🚫📷' : '⚠️📷'}</span>
          <span class="big">🔁</span>
        </button>
      )}
    </main>
  );
}
