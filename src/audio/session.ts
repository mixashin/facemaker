import { getMic, releaseMic } from './mic';
import { VoiceEngine } from './engine';
import type { VoiceId } from './voice';

// The microphone is on only while something uses it: a recording, the voice mirror, the shout preset.
// Each user takes a lease and gives it back. A few seconds after the last lease the engine is closed and
// the mic tracks are stopped. The delay keeps a second hold right after the first one quick.
// No mic in the background: while the page is hidden there is no delay, and a page that hides inside the delay
// ends it (rest).
export const IDLE_MS = 3000;

export type Engine = Pick<VoiceEngine, 'setPreset' | 'resume' | 'dispose' | 'level' | 'stream'>;
export type Lease = { engine: Engine | null; release(): void };
type Deps = {
  getMic: () => Promise<MediaStream | null>;
  releaseMic: () => void;
  makeEngine: (mic: MediaStream, id: VoiceId) => Engine;
  idleMs?: number;
  hidden?: () => boolean; // the page is in the background
};

export function createVoiceSession(deps: Deps) {
  const idleMs = deps.idleMs ?? IDLE_MS;
  const hidden = deps.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  let engine: Engine | null = null;
  let engineMic: MediaStream | null = null;
  let users = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;

  const drop = () => {
    engine?.dispose();
    engine = null;
    engineMic = null;
    deps.releaseMic();
  };

  // Call from a user gesture: it may show the mic prompt and it resumes audio. Never rejects.
  async function acquire(id: VoiceId): Promise<Lease> {
    clearTimeout(idle);
    users++; // counted at once: a release elsewhere cannot close the mic under this caller
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      users--;
      if (users === 0) idle = setTimeout(drop, hidden() ? 0 : idleMs);
    };
    const none = (): Lease => { release(); return { engine: null, release() {} }; };

    const mic = await deps.getMic();
    if (!mic) return none();
    try {
      if (engine && engineMic !== mic) { engine.dispose(); engine = null; } // the old stream died
      if (!engine) { engine = deps.makeEngine(mic, id); engineMic = mic; }
      else engine.setPreset(id);
      await engine.resume().catch(() => {});
    } catch (e) {
      console.warn('voice engine failed', e);
      engine = null;
      engineMic = null;
      return none();
    }
    return { engine, release };
  }

  // The page went to the background. With no user the mic goes off now. A user that holds the mic decides for
  // itself: a clip that ends there saves its sound first, and lets go then.
  function rest(): void {
    if (users > 0 || !engine) return;
    clearTimeout(idle);
    drop();
  }

  return {
    acquire,
    rest,
    current: (): Engine | null => engine,
    setPreset(id: VoiceId): void { engine?.setPreset(id); },
  };
}

const session = createVoiceSession({ getMic: () => getMic(), releaseMic, makeEngine: (mic, id) => new VoiceEngine(mic, id) });

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) session.rest(); });

export const acquireVoice = session.acquire;
export const currentEngine = session.current;
export const setVoicePreset = session.setPreset;
