import { signal } from '@preact/signals';

export type MicState = 'idle' | 'asking' | 'live' | 'denied';
export const micState = signal<MicState>('idle');

export const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };

let stream: MediaStream | null = null;
let pending: Promise<MediaStream | null> | null = null;
let asked = false; // the mic question was put at least once in this session

const alive = (s: MediaStream) => s.getAudioTracks().some((t) => t.readyState === 'live');

// Asked at first need only. One prompt for concurrent callers. A refusal is an answer, not an error.
// A cached stream whose track ended (unplugged, permission revoked) is dropped and the mic is asked again.
export function getMic(md: Pick<MediaDevices, 'getUserMedia'> = navigator.mediaDevices): Promise<MediaStream | null> {
  if (stream && alive(stream)) return Promise.resolve(stream);
  if (stream) releaseMic();
  if (pending) return pending;
  asked = true;
  if (micState.value !== 'denied') micState.value = 'asking'; // a repeated refusal keeps the lock hint steady
  pending = md.getUserMedia(MIC_CONSTRAINTS)
    .then((s) => { stream = s; micState.value = 'live'; return s as MediaStream | null; })
    .catch(() => { micState.value = 'denied'; return null; })
    .finally(() => { pending = null; });
  return pending;
}

// Stops the tracks: the mic indicator of the browser goes off. The voice session calls this when the
// last user of the mic let go (see session.ts). The privacy page promises it.
export function releaseMic(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (micState.value === 'live' || micState.value === 'asking') micState.value = 'idle';
}

// First open of the voice tab: put the mic question then, not in the middle of a hold. True only while
// the answer is open. A granted mic needs nothing, so opening the tab never turns the mic on.
export async function micNeedsPrompt(perms: { query(d: { name: string }): Promise<{ state: string }> } | undefined = globalThis.navigator?.permissions as never): Promise<boolean> {
  try {
    const s = await perms!.query({ name: 'microphone' });
    if (s.state === 'denied') micState.value = 'denied';
    return s.state === 'prompt';
  } catch {
    return !asked; // no permissions API: ask once per session
  }
}
