import { getMic } from './mic';
import { VoiceEngine } from './engine';
import type { VoiceId } from './voice';

let engine: VoiceEngine | null = null;

// The one voice engine of the app. Call from a user gesture: it may show the mic prompt and resumes audio.
export async function ensureVoice(id: VoiceId): Promise<VoiceEngine | null> {
  const mic = await getMic();
  if (!mic) return null;
  if (!engine) engine = new VoiceEngine(mic, id);
  else engine.setPreset(id);
  await engine.resume().catch(() => {});
  return engine;
}

export function currentEngine(): VoiceEngine | null { return engine; }
