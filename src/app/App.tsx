import { useEffect, useRef } from 'preact/hooks';
import { startCamera } from '../camera/camera';
import { FaceTracker, type Face } from '../tracking/faceTracker';
import { FaceRenderer } from '../render/renderer';
import { handlesFor } from '../filters/presets';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current!, canvas = canvasRef.current!;
    let faces: Face[] = [];
    const r = new FaceRenderer(canvas, video);
    const t = new FaceTracker({ numFaces: 2, onFaces: (f) => { faces = f; }, onReady: (d) => console.log('delegate', d), onError: console.error });
    let raf = 0;
    const loop = (now: number) => {
      t.push(video, now);
      r.setHandles(handlesFor('bigEyes', faces, video.videoWidth / video.videoHeight));
      r.render();
      raf = requestAnimationFrame(loop);
    };
    startCamera(video, 'user').then(() => { t.start(); raf = requestAnimationFrame(loop); }).catch(console.error);
    return () => { cancelAnimationFrame(raf); t.stop(); r.dispose(); };
  }, []);
  return (
    <main class="app">
      <video ref={videoRef} class="hidden-video" />
      <canvas ref={canvasRef} class="stage" />
    </main>
  );
}
