import { useEffect, useRef } from 'preact/hooks';
import { startCamera, stopCamera, cameraLost } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesForAll, MAX_HANDLES } from '../filters/presets';
import { spritesForAll } from '../filters/stickers';
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
import { TARGETS, faceFrame, windows } from '../filters/faceon';
import { sceneById, bitSprites } from '../filters/scenes';
import { placeProps, headPose } from '../filters/props3d';
import { SegTracker } from '../tracking/segTracker';
import { TopBar } from './TopBar';
import { CaptureButton } from './CaptureButton';
import { Recorder, type RecCtor } from '../capture/recorder';
import { RecordCanvas } from '../capture/recordCanvas';
import { acquireVoice, currentEngine, type Lease } from '../audio/session';
import { micState } from '../audio/mic';
import { isRealClip, type HoldEvent } from './hold';
import { presets, facing, camState, flash, busy, dockOpen, stickers, text, tutorialSeen, showSettings, showAbout, screen, store, items, refreshGallery, sliders, galleryThumb, flyShot, camStateFromError, recording, voice, makeup, target, photo, still, scene, tryScene, props3d } from './state';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recCanvas = useRef<RecordCanvas | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const holding = useRef(false);
  const holdT0 = useRef(0);
  const recLease = useRef<Lease | null>(null);

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
    const fm = ((globalThis as any).__fm = { frames: 0, faces: 0, delegate: '', shots: 0, clips: 0, mic: () => micState.value, target: () => ({ id: target.value, photo: photo.value }), masks: 0, mask: [0, 0], face: () => (faces[0] ? { landmarks: Array.from(faces[0].landmarks), matrix: Array.from(faces[0].matrix) } : null), nose: () => (faces[0] ? [faces[0].landmarks[4 * 3], faces[0].landmarks[4 * 3 + 1]] : null), scene: (s: import('../filters/scenes').Scene | null) => { tryScene.value = s; scene.value = s ? s.id : 'none'; } });
    const t = new FaceTracker({
      numFaces: 2,
      onFaces: (f) => { faces = f; fm.frames++; fm.faces = f.length; },
      onReady: (d) => { fm.delegate = d; },
      onError: (m) => console.error('tracker', m),
    });
    still.detect = (picture) => t.detectStill(picture);
    // The person mask for a place (made before the camera starts: start() resets it). The segmenter runs only while a place is on and the camera view shows.
    const seg = new SegTracker({ onMask: (m, w, h) => { fm.masks++; fm.mask = [w, h]; r.setMask(m, w, h); }, onError: (m) => console.warn('segmenter', m) });
    const loop = (now: number) => {
      if (screen.value === 'camera') t.push(video, now);
      const aspect = video.videoWidth / video.videoHeight;
      const level = presets.value.includes('shout') ? currentEngine()?.level() ?? 0 : 0; // mic volume drives the shout preset
      const handles = [...handlesForAll(presets.value, faces, aspect, level), ...sliderHandles(sliders.value, faces, aspect, now)].slice(0, MAX_HANDLES); // what the shader takes
      r.setHandles(handles);
      // Face-on mode: a picture with the live eyes and mouth of the first face. The filters work on them.
      const tg = target.value === 'photo' ? photo.value : TARGETS.find((x) => x.id === target.value);
      const lm = faces[0]?.landmarks;
      r.setFaceOn(tg ? { target: tg, frame: lm ? faceFrame(lm, aspect) : null, wins: lm ? windows(lm, handles, aspect, tg) : [] } : null);
      r.setMakeup(makeup.value, faces);
      const heads = props3d.value.length ? faces.map((f) => headPose(f, aspect)) : [];
      r.setProps3d(placeProps(props3d.value, faces, aspect, now, heads), heads, now, props3d.value.length > 0);
      const place = screen.value === 'camera' && !tg && !document.hidden ? sceneById(scene.value, tryScene.value) : null; // a face-on picture has no camera view
      if (place && !seg.running) seg.start(); else if (!place && seg.running) seg.stop();
      if (place) seg.push(video, now);
      const inPlace = r.setScene(place, now); // true when the scene was on the screen in the last frame
      r.setSprites([...spritesForAll(stickers.value, faces, aspect), ...(inPlace ? bitSprites(place, now, aspect, r.visible()) : [])]);
      r.setText(text.value);
      r.render();
      recCanvas.current?.draw(canvas); // while recording: copy the visible crop for the recorder
      raf = requestAnimationFrame(loop);
    };
    let started = false;
    const start = () => {
      camState.value = 'starting';
      faces = []; // no effect of the old picture stays while the camera restarts
      seg.stop(); r.rest(); // the mask of the old picture too. The loop starts the segmenter again
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
    // A hidden tab stops the render loop: end the clip and save it.
    const onHide = () => { if (!document.hidden) return; if (recording.value) stopRec(); seg.stop(); r.rest(); }; // no work in the background
    document.addEventListener('visibilitychange', onHide);
    // Back from another app that took the camera (the photo picker can open the camera app): start it again.
    const onBack = () => { if (!document.hidden && camState.value === 'live' && cameraLost(video.srcObject as MediaStream | null)) start(); };
    document.addEventListener('visibilitychange', onBack);
    // The shout preset listens to the mic. It holds the mic only while it is on the visible camera screen.
    let shout: Promise<Lease> | null = null;
    const syncShout = () => {
      const want = presets.value.includes('shout') && screen.value === 'camera' && !document.hidden;
      if (want && !shout) shout = acquireVoice(voice.value);
      else if (!want && shout) { shout.then((l) => l.release()); shout = null; }
    };
    const unsubShout = [presets.subscribe(syncShout), screen.subscribe(syncShout)];
    document.addEventListener('visibilitychange', syncShout);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('visibilitychange', onBack);
      document.removeEventListener('visibilitychange', syncShout);
      unsubShout.forEach((u) => u());
      shout?.then((l) => l.release());
      still.detect = null;
      seg.stop();
      unsub(); cancelAnimationFrame(raf); t.stop(); r.dispose(); stopCamera(video);
    };
  }, []);

  // Saved: the picture flies into the gallery button. Not saved (no device storage): hand the file over.
  const keep = async (file: File, counter: 'shots' | 'clips') => {
    const saved = !!store.value && (await safePut(store.value, file.name, file));
    if (!saved) { await shareOrDownload(file); return; }
    (globalThis as any).__fm[counter]++;
    const isVideo = file.type.startsWith('video/');
    const thumb = isVideo ? await store.value!.thumb(file.name).catch(() => null) : file;
    if (thumb) {
      const url = URL.createObjectURL(thumb);
      flyShot.value = url;
      setTimeout(() => { flyShot.value = null; if (galleryThumb.value) URL.revokeObjectURL(galleryThumb.value); galleryThumb.value = url; }, 700);
    }
    if (!isVideo) store.value!.thumb(file.name).catch(() => {});
    refreshGallery().catch(() => {});
  };

  const capture = async () => {
    if (busy.value || recording.value || camState.value !== 'live') return; // kids double tap
    busy.value = true;
    flash.value = true;
    setTimeout(() => (flash.value = false), 120);
    try {
      const rect = canvasRef.current!.getBoundingClientRect();
      const file = await snapshot(canvasRef.current!, 0.92, { width: rect.width, height: rect.height }); // what the screen shows
      await keep(file, 'shots');
    } catch (e) {
      console.error('capture', e);
    } finally {
      setTimeout(() => (busy.value = false), 500); // lockout: a fast double tap makes one photo, not two
    }
  };

  const startRec = async () => {
    if (busy.value || recording.value || camState.value !== 'live' || typeof MediaRecorder === 'undefined') return;
    const stage = canvasRef.current!;
    const rect = stage.getBoundingClientRect();
    const lease = await acquireVoice(voice.value); // mic at first need. no engine when refused: a silent video
    if (!holding.current || recording.value) { lease.release(); return; } // released while the permission prompt was open
    const rc = new RecordCanvas(stage, { width: rect.width, height: rect.height });
    rc.draw(stage);
    recorder.current ??= new Recorder(MediaRecorder as unknown as RecCtor, (t) => MediaRecorder.isTypeSupported(t));
    if (!recorder.current.start(rc.stream(30, lease.engine?.stream ?? null), () => stopRec())) { lease.release(); return; }
    recLease.current = lease;
    recCanvas.current = rc;
    recording.value = true;
    dockOpen.value = false;
  };

  const stopRec = async () => {
    if (!recording.value) return;
    recording.value = false;
    recCanvas.current = null;
    busy.value = true;
    try {
      const file = await recorder.current!.stop();
      if (file) await keep(file, 'clips');
    } catch (e) {
      console.error('record', e);
    } finally {
      recLease.current?.release(); // the mic turns off a few seconds later (session.ts)
      recLease.current = null;
      setTimeout(() => (busy.value = false), 500);
    }
  };

  // The finger came up. A long hold is a video. A hold that ended at once was a slow tap: drop what
  // was recorded and take the photo the kid wanted.
  const endHold = async () => {
    if (isRealClip(performance.now() - holdT0.current)) return stopRec();
    if (recording.value) {
      recording.value = false;
      recCanvas.current = null;
      await recorder.current?.stop().catch(() => null);
      recLease.current?.release();
      recLease.current = null;
    }
    capture();
  };

  // The shutter handler must be stable (CaptureButton reads it once) and must see fresh closures.
  const shutter = useRef((_e: HoldEvent) => {});
  shutter.current = (e) => {
    if (e === 'tap') capture();
    else if (e === 'holdStart') { holding.current = true; holdT0.current = performance.now(); startRec(); }
    else { holding.current = false; endHold(); }
  };
  const onShutter = useRef((e: HoldEvent) => shutter.current(e)).current;

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
          {!recording.value && <TopBar />}
          {screen.value === 'camera' && !recording.value && <Dock />}
          <CaptureButton onShutter={onShutter} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} onGallery={() => { dockOpen.value = false; refreshGallery().catch(() => {}); screen.value = 'gallery'; }} />
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
