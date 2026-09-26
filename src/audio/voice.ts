// Voice presets and the math behind them. Pure: no Web Audio objects here (see engine.ts).
export type VoiceId = 'none' | 'chipmunk' | 'deep' | 'monster' | 'robot' | 'echo' | 'telephone';

export const VOICE_PRESETS: { id: VoiceId; icon: string }[] = [
  { id: 'none', icon: '🙂' },
  { id: 'chipmunk', icon: '🐿️' },
  { id: 'deep', icon: '🐻' },
  { id: 'monster', icon: '👹' },
  { id: 'robot', icon: '🤖' },
  { id: 'echo', icon: '🏔️' },
  { id: 'telephone', icon: '☎️' },
];

export type VoiceParams = {
  semitones: number;   // pitch shift, 0 = off
  ringHz: number;      // ring modulator carrier, 0 = off
  distortion: number;  // waveshaper amount k, 0 = off
  reverb: number;      // impulse length in seconds, 0 = off
  echo: { delay: number; feedback: number } | null;
  telephone: boolean;  // 500 Hz to 2 kHz band
};

const OFF: VoiceParams = { semitones: 0, ringHz: 0, distortion: 0, reverb: 0, echo: null, telephone: false };

export function voiceParams(id: VoiceId): VoiceParams {
  switch (id) {
    case 'chipmunk': return { ...OFF, semitones: 8 };
    case 'deep': return { ...OFF, semitones: -6 };
    case 'monster': return { ...OFF, semitones: -8, distortion: 20, reverb: 1.2 };
    case 'robot': return { ...OFF, ringHz: 30, distortion: 8 };
    case 'echo': return { ...OFF, echo: { delay: 0.25, feedback: 0.4 } };
    case 'telephone': return { ...OFF, telephone: true, distortion: 4 };
    default: return { ...OFF };
  }
}

// Delay-line pitch shifter (the "Jungle" method, as in Tone.js PitchShift): a delay whose time sweeps
// linearly across `window` reads the input faster or slower than it was written. Two taps half a sweep
// apart crossfade over each other's jump. rate = sweeps per second, delay = base + amp * ramp(0..1).
export const WINDOW = 0.08;

export function shiftParams(semitones: number, window = WINDOW): { rate: number; amp: number; base: number } {
  const r = Math.pow(2, semitones / 12);
  if (Math.abs(r - 1) < 1e-9) return { rate: 0, amp: 0, base: 0 };
  return r > 1
    ? { rate: (r - 1) / window, amp: -window, base: window }
    : { rate: (1 - r) / window, amp: window, base: 0 };
}

export function rampTable(n: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = i / n;
  return a;
}

// Tap gain over one sweep: zero at the jump, one in the middle. sin^2 + cos^2 = 1 for the two taps.
export function fadeTable(n: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin((Math.PI * i) / n) ** 2;
  return a;
}

export function distortionCurve(k: number, n = 1024): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

// Noise burst with a power decay: a cheap room for the ConvolverNode.
export function impulse(sampleRate: number, seconds: number, decay = 3, rand: () => number = Math.random): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (rand() * 2 - 1) * Math.pow(1 - i / n, decay);
  return a;
}

export function rms(s: ArrayLike<number>): number {
  if (s.length === 0) return 0;
  let a = 0;
  for (let i = 0; i < s.length; i++) a += s[i] * s[i];
  return Math.sqrt(a / s.length);
}

const GATE = 0.02, FULL = 0.25; // below GATE is room noise, FULL is a shout

export function nextLevel(r: number, prev: number, attack = 0.5, release = 0.08): number {
  const target = Math.min(1, Math.max(0, (r - GATE) / (FULL - GATE)));
  return prev + (target - prev) * (target > prev ? attack : release);
}
