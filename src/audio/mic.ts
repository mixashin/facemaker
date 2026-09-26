import { signal } from '@preact/signals';

export type MicState = 'idle' | 'asking' | 'live' | 'denied';
export const micState = signal<MicState>('idle');

export const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };

let stream: MediaStream | null = null;
let pending: Promise<MediaStream | null> | null = null;

// Asked at first need only. One prompt for concurrent callers. A refusal is an answer, not an error.
export function getMic(md: Pick<MediaDevices, 'getUserMedia'> = navigator.mediaDevices): Promise<MediaStream | null> {
  if (stream) return Promise.resolve(stream);
  if (pending) return pending;
  micState.value = 'asking';
  pending = md.getUserMedia(MIC_CONSTRAINTS)
    .then((s) => { stream = s; micState.value = 'live'; return s as MediaStream | null; })
    .catch(() => { micState.value = 'denied'; return null; })
    .finally(() => { pending = null; });
  return pending;
}

export function resetMic(): void {
  stream = null;
  pending = null;
  micState.value = 'idle';
}
