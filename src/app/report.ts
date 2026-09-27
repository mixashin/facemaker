// The device report in the About sheet: what a helper must know when the app does not work on one device.
// Technical facts only. No picture, no photo, no name. It leaves the device only when the person copies it.
import type { Health } from '../tracking/health';

export type Facts = {
  build: string;
  installed: boolean;
  agent: string;
  screen: string;
  video: string;
  webgl: string;
  worker: string; // state of the service worker
  tracker: Pick<Health, 'prefer' | 'delegate' | 'results' | 'withFace' | 'errors' | 'firstError' | 'lastError' | 'note' | 'files' | 'restarts'>;
};

export function report(f: Facts): string {
  const t = f.tracker;
  return [
    `facemaker ${f.build}`,
    `installed: ${f.installed ? 'yes' : 'no'}`,
    `device: ${f.agent || 'none'}`,
    `screen: ${f.screen || 'none'}`,
    `camera: ${f.video || 'none'}`,
    `graphics: ${f.webgl || 'none'}`,
    `tracker: ${t.delegate || (t.files ? 'not started' : 'not started, its files are not on the device yet')} (asked: ${t.prefer})`,
    `tracker results: ${t.results}, with a face: ${t.withFace}, errors: ${t.errors}, new starts: ${t.restarts}`,
    ...(t.note ? [`note: ${t.note}`] : []),
    ...(t.firstError && t.firstError !== t.lastError ? [`first error: ${t.firstError}`] : []),
    ...(t.lastError ? [`last error: ${t.lastError}`] : []),
    `offline copy: ${f.worker || 'none'}`,
  ].join('\n');
}

// What the app knows about the running tracker and the camera. App.tsx fills it.
export const live: { health: Health | null; video: () => string } = { health: null, video: () => '' };

export async function gather(): Promise<Facts> {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  const webgl = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
  gl?.getExtension('WEBGL_lose_context')?.loseContext(); // a phone has few WebGL contexts: give this one back
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const h = live.health;
  return {
    build: __BUILD__,
    installed: matchMedia('(display-mode: standalone)').matches,
    agent: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight} @${devicePixelRatio}`,
    video: live.video(),
    webgl,
    worker: reg?.active?.state ?? '',
    tracker: h ?? { prefer: 'auto', delegate: '', results: 0, withFace: 0, errors: 0, firstError: '', lastError: '', note: '', files: false, restarts: 0 },
  };
}
