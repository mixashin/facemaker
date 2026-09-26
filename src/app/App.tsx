import { useEffect, useRef } from 'preact/hooks';
import { startCamera } from '../camera/camera';

export function App() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    startCamera(ref.current!, 'user').catch((e) => console.error('camera', e.name));
  }, []);
  return (
    <main class="app">
      <video ref={ref} style="width:100%;height:100%;object-fit:cover" />
    </main>
  );
}
