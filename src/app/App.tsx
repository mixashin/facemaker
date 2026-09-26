import { useEffect, useRef } from 'preact/hooks';
import { startCamera, stopCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesFor } from '../filters/presets';
import { snapshot } from '../capture/snapshot';
import { shareOrDownload } from '../capture/share';
import { FilterStrip } from './FilterStrip';
import { CaptureButton } from './CaptureButton';
import { preset, facing, camState, flash, busy, camStateFromError } from './state';

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

  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" />
      {flash.value && <div class="flash" />}
      {camState.value === 'live' && (
        <>
          <FilterStrip />
          <CaptureButton onCapture={capture} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} />
        </>
      )}
      {(camState.value === 'denied' || camState.value === 'nocam' || camState.value === 'error') && (
        <button class="blocker" onClick={retry} aria-label="retry camera">
          <span class="big">{camState.value === 'denied' ? '🔒📷' : camState.value === 'nocam' ? '🚫📷' : '⚠️📷'}</span>
          <span class="big">🔁</span>
        </button>
      )}
    </main>
  );
}
