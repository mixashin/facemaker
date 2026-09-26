# M3 Video + Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold the shutter to record a video of what the screen shows, with the kid's voice changed by a chosen effect, saved to the gallery and playable there.

**Architecture:** A second 2D canvas at the visible crop size is drawn from the WebGL stage each frame and feeds `captureStream(30)`. The microphone (asked at first need) runs through a native Web Audio node graph (delay-line pitch shifter plus classic effects) into a `MediaStreamDestination`, never to the speakers. `MediaRecorder` muxes both into mp4 (webm fallback) with no timeslice. All DSP math, mime selection, naming and gesture logic are pure functions with node tests; browser objects are injected so graph wiring and the recorder state machine are tested with small fakes.

**Tech Stack:** Vite 8, Preact + signals, TypeScript 6, Three.js (unchanged), Web Audio native nodes, MediaRecorder, OPFS gallery, Vitest (node environment), Playwright smoke script. No new dependency.

**Spec:** `docs/SPEC.md` section "M3: Video + voice" (revised 2026-09-27). Evidence: `research/05-voice-effects-engine-2026-09-27.md`. Design notes: `TODO.md` "Handoff 2026-09-27".

## Global Constraints

- Zero third-party requests at runtime. No new npm dependency. No AudioWorklet.
- The microphone signal never connects to `AudioContext.destination` (no live monitoring).
- `AudioContext` is created with default options (no `latencyHint`), only after a user gesture.
- Mic constraints: `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`.
- Mic permission is requested at first need only: first hold on the shutter, first open of the voice tab, or picking the `shout` preset.
- Recorder mime order: `video/mp4;codecs="avc1.424028,mp4a.40.2"`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm`. No timeslice. `videoBitsPerSecond: 4_000_000`. `start()` in try/catch. Max 60 s per clip.
- Video file names: `facemaker-<ISO with : and . replaced by ->.<mp4|webm>` (must pass `parseName` in `src/storage/gallery.ts`).
- Vitest runs in the `node` environment: no `document`, no `window`. Browser objects reach the code through parameters with defaults.
- Every new string exists in `src/i18n/en.json` and `src/i18n/sr.json` (Serbian Latin). The parity test must stay green.
- Kid UI: icons, tap targets use `var(--tap)`, no reading required.
- Commit messages: plain conventional commits, no `Co-Authored-By` trailer, no "Generated with" line.
- Run `npx vitest run` and `npx tsc -b` before every commit. Both must be clean.

## Review Focus

- Microphone denied or missing: a hold still records a silent video, the voice tab shows a lock hint, no unhandled promise rejection. Tests: Task 2 `getMic` denied, Task 3 `RecordCanvas.stream` without audio.
- Hold released early (during the permission prompt or before the recorder starts): no recorder left running, `busy` released. Tests: Task 5 `createHold` cancel paths, Task 3 `stop()` before `start()`.
- 60 s cap reached, or the tab goes to the background while recording: the clip stops and is saved. Tests: Task 3 auto-stop timer; Task 5 wires `visibilitychange`.
- Storage failure on a large clip: fallback to share, no zero-byte file, `busy` released. Existing `safePut` tests cover the store; Task 5 routes the clip through `safePut`.
- Voice preset changed while recording: the recorded audio track must stay the same stream. Test: Task 2 `VoiceEngine.stream` identity across `setPreset`.

---

### Task 1: Voice presets and DSP math

**Files:**
- Create: `src/audio/voice.ts`
- Test: `src/audio/voice.test.ts`

**Interfaces:**
- Produces: `VoiceId`, `VOICE_PRESETS: { id: VoiceId; icon: string }[]`, `VoiceParams`, `voiceParams(id: VoiceId): VoiceParams`, `WINDOW = 0.08`, `shiftParams(semitones: number, window?: number): { rate: number; amp: number; base: number }`, `rampTable(n: number): Float32Array`, `fadeTable(n: number): Float32Array`, `distortionCurve(k: number, n?: number): Float32Array`, `impulse(sampleRate: number, seconds: number, decay?: number, rand?: () => number): Float32Array`, `rms(s: ArrayLike<number>): number`, `nextLevel(r: number, prev: number, attack?: number, release?: number): number`.

- [ ] **Step 1: Write the failing test**

Create `src/audio/voice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VOICE_PRESETS, voiceParams, shiftParams, rampTable, fadeTable, distortionCurve, impulse, rms, nextLevel, WINDOW } from './voice';

describe('voice presets', () => {
  it('lists the seven voices, none first, unique ids, an icon each', () => {
    expect(VOICE_PRESETS.map((p) => p.id)).toEqual(['none', 'chipmunk', 'deep', 'monster', 'robot', 'echo', 'telephone']);
    for (const p of VOICE_PRESETS) expect(p.icon.length).toBeGreaterThan(0);
  });

  it('none changes nothing', () => {
    expect(voiceParams('none')).toEqual({ semitones: 0, ringHz: 0, distortion: 0, reverb: 0, echo: null, telephone: false });
  });

  it('chipmunk goes up, deep and monster go down, robot rings at 30 Hz', () => {
    expect(voiceParams('chipmunk').semitones).toBe(8);
    expect(voiceParams('deep').semitones).toBe(-6);
    expect(voiceParams('monster').semitones).toBe(-8);
    expect(voiceParams('monster').reverb).toBeGreaterThan(0);
    expect(voiceParams('monster').distortion).toBeGreaterThan(0);
    expect(voiceParams('robot').ringHz).toBe(30);
    expect(voiceParams('telephone').telephone).toBe(true);
  });

  it('echo feedback stays below one so the loop dies out', () => {
    const e = voiceParams('echo').echo!;
    expect(e.delay).toBeCloseTo(0.25);
    expect(e.feedback).toBeGreaterThan(0);
    expect(e.feedback).toBeLessThan(1);
  });
});

describe('shiftParams', () => {
  it('zero semitones freezes the ramp', () => {
    expect(shiftParams(0)).toEqual({ rate: 0, amp: 0, base: 0 });
  });

  it('pitch up sweeps the delay from the window down to zero', () => {
    const p = shiftParams(12, 0.08); // ratio 2
    expect(p.base).toBeCloseTo(0.08, 9);
    expect(p.amp).toBeCloseTo(-0.08, 9);
    expect(p.rate).toBeCloseTo(1 / 0.08, 6);
  });

  it('pitch down sweeps the delay from zero up to the window', () => {
    const p = shiftParams(-12, 0.08); // ratio 0.5
    expect(p.base).toBe(0);
    expect(p.amp).toBeCloseTo(0.08, 9);
    expect(p.rate).toBeCloseTo(0.5 / 0.08, 6);
  });

  it('the delay stays inside 0..window and the read speed equals the pitch ratio', () => {
    for (const st of [-12, -8, -6, 3, 8, 12]) {
      const p = shiftParams(st);
      for (const ramp of [0, 0.5, 0.999]) {
        const d = p.base + p.amp * ramp;
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(WINDOW + 1e-9);
      }
      // d(t) = base + amp * rate * t, so the read head moves at 1 - amp * rate
      expect(1 - p.amp * p.rate).toBeCloseTo(Math.pow(2, st / 12), 6);
    }
  });
});

describe('tables', () => {
  it('ramp rises linearly from 0 and stays below 1', () => {
    const r = rampTable(100);
    expect(r[0]).toBe(0);
    expect(r[50]).toBeCloseTo(0.5, 6);
    expect(r[99]).toBeCloseTo(0.99, 6);
  });

  it('fade is zero at the ramp jump and two taps half a cycle apart sum to one', () => {
    const n = 1000, f = fadeTable(n);
    expect(f[0]).toBe(0);
    for (let i = 0; i < n; i += 37) expect(f[i] + f[(i + n / 2) % n]).toBeCloseTo(1, 5);
  });
});

describe('distortionCurve', () => {
  it('is odd, monotonic and ends at -1 and 1', () => {
    const c = distortionCurve(20, 257);
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[256]).toBeCloseTo(1, 6);
    expect(c[128]).toBeCloseTo(0, 6);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    for (let i = 0; i < 128; i++) expect(c[i]).toBeCloseTo(-c[256 - i], 6);
  });

  it('k = 0 is the identity', () => {
    const c = distortionCurve(0, 5);
    expect(Array.from(c)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });
});

describe('impulse', () => {
  it('has the asked length and decays to silence', () => {
    const a = impulse(1000, 1.2, 3, () => 1); // rand 1 gives the bare envelope
    expect(a.length).toBe(1200);
    expect(a[0]).toBeCloseTo(1, 6);
    expect(a[600]).toBeCloseTo(0.125, 6); // (1 - 0.5)^3
    expect(Math.abs(a[1199])).toBeLessThan(1e-6);
  });

  it('never returns an empty buffer', () => {
    expect(impulse(1000, 0).length).toBe(1);
  });
});

describe('level', () => {
  it('rms of a constant is its magnitude, of nothing is zero', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('silence and room noise stay at zero', () => {
    expect(nextLevel(0, 0)).toBe(0);
    expect(nextLevel(0.01, 0)).toBe(0);
  });

  it('rises fast, falls slowly, and never passes one', () => {
    const up = nextLevel(0.5, 0);
    expect(up).toBeGreaterThan(0.4);
    expect(up).toBeLessThanOrEqual(1);
    const down = nextLevel(0, 1);
    expect(down).toBeGreaterThan(0.8);
    expect(down).toBeLessThan(1);
    let l = 0; for (let i = 0; i < 50; i++) l = nextLevel(5, l);
    expect(l).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/voice.test.ts`
Expected: FAIL, cannot resolve `./voice`.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/voice.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/audio/voice.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
npx vitest run && npx tsc -b
git add src/audio/voice.ts src/audio/voice.test.ts
git commit -m "feat: voice presets and pitch shifter math"
```

---

### Task 2: Voice engine and microphone

**Files:**
- Create: `src/audio/engine.ts`, `src/audio/mic.ts`, `src/audio/session.ts`
- Test: `src/audio/engine.test.ts`, `src/audio/mic.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces from `./voice`.
- Produces:
  - `class PitchShifter { input: GainNode; output: GainNode; constructor(ctx: BaseAudioContext, semitones: number, window?: number); dispose(): void }`
  - `buildChain(ctx: BaseAudioContext, input: AudioNode, id: VoiceId, rand?: () => number): { output: AudioNode; dispose(): void }`
  - `class VoiceEngine { constructor(mic: MediaStream, id: VoiceId, makeCtx?: () => AudioContext); readonly stream: MediaStream; setPreset(id: VoiceId): void; level(): number; resume(): Promise<void>; dispose(): void }`
  - `micState: Signal<'idle' | 'asking' | 'live' | 'denied'>`, `MIC_CONSTRAINTS`, `getMic(md?: Pick<MediaDevices, 'getUserMedia'>): Promise<MediaStream | null>`, `resetMic(): void`
  - `ensureVoice(id: VoiceId): Promise<VoiceEngine | null>`, `currentEngine(): VoiceEngine | null`

- [ ] **Step 1: Write the failing tests**

Create `src/audio/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChain, VoiceEngine } from './engine';
import { shiftParams, VOICE_PRESETS } from './voice';

type N = Record<string, any>;

function fake() {
  const edges: [N, N][] = [];
  const made: N[] = [];
  const started: { node: N; offset: number }[] = [];
  const param = (value: number) => ({ value, isParam: true });
  const node = (kind: string, extra: N = {}): N => {
    const n: N = {
      kind, ...extra,
      connect(t: N) { edges.push([n, t]); return t; },
      disconnect() { for (let i = edges.length - 1; i >= 0; i--) if (edges[i][0] === n) edges.splice(i, 1); },
    };
    made.push(n);
    return n;
  };
  const ctx: N = {
    sampleRate: 1000,
    state: 'suspended',
    destination: { kind: 'destination' },
    resume: async () => { ctx.state = 'running'; },
    close: async () => { ctx.state = 'closed'; },
    createGain: () => node('gain', { gain: param(1) }),
    createDelay: (max: number) => node('delay', { max, delayTime: param(0) }),
    createBiquadFilter: () => node('biquad', { type: 'lowpass', frequency: param(350) }),
    createOscillator: () => { const o = node('osc', { type: 'sine', frequency: param(440), start: () => started.push({ node: o, offset: 0 }), stop: () => {} }); return o; },
    createWaveShaper: () => node('shaper', { curve: null, oversample: 'none' }),
    createConvolver: () => node('convolver', { buffer: null }),
    createBuffer: (_c: number, length: number) => ({ length, data: null as Float32Array | null, copyToChannel(d: Float32Array) { this.data = d; } }),
    createBufferSource: () => { const s = node('source', { buffer: null, loop: false, playbackRate: param(1), start: (_w = 0, offset = 0) => started.push({ node: s, offset }), stop: () => {} }); return s; },
    createAnalyser: () => node('analyser', { fftSize: 2048, getFloatTimeDomainData: (b: Float32Array) => b.fill(ctx.signal ?? 0) }),
    createMediaStreamSource: (s: unknown) => node('mic', { mediaStream: s }),
    createMediaStreamDestination: () => node('dest', { stream: { id: 'processed' } }),
  };
  const kinds = (k: string) => made.filter((n) => n.kind === k);
  const has = (a: N, b: N) => edges.some(([x, y]) => x === a && y === b);
  return { ctx: ctx as any, edges, made, started, kinds, has };
}

describe('buildChain', () => {
  it('none passes the input through and creates nothing', () => {
    const f = fake();
    const input = f.ctx.createGain();
    const n0 = f.made.length;
    expect(buildChain(f.ctx, input, 'none').output).toBe(input);
    expect(f.made.length).toBe(n0);
  });

  it('telephone is two lowpass at 2 kHz then two highpass at 500 Hz', () => {
    const f = fake();
    buildChain(f.ctx, f.ctx.createGain(), 'telephone');
    expect(f.kinds('biquad').map((b) => [b.type, b.frequency.value])).toEqual([['lowpass', 2000], ['lowpass', 2000], ['highpass', 500], ['highpass', 500]]);
  });

  it('robot multiplies the voice by a 30 Hz sine: oscillator into a gain whose own value is zero', () => {
    const f = fake();
    buildChain(f.ctx, f.ctx.createGain(), 'robot');
    const osc = f.kinds('osc')[0];
    expect(osc.frequency.value).toBe(30);
    const ring = f.kinds('gain').find((g) => f.has(osc, g.gain))!;
    expect(ring).toBeTruthy();
    expect(ring.gain.value).toBe(0);
    expect(f.started.some((s) => s.node === osc)).toBe(true);
  });

  it('chipmunk runs two delay taps half a sweep apart at the shifter rate', () => {
    const f = fake();
    buildChain(f.ctx, f.ctx.createGain(), 'chipmunk');
    const p = shiftParams(8);
    expect(f.kinds('delay')).toHaveLength(2);
    for (const d of f.kinds('delay')) expect(d.delayTime.value).toBeCloseTo(p.base, 9);
    const src = f.kinds('source');
    expect(src).toHaveLength(4); // a ramp and a fade per tap
    for (const s of src) { expect(s.loop).toBe(true); expect(s.playbackRate.value).toBeCloseTo(p.rate, 9); }
    expect(f.started.filter((s) => s.node.kind === 'source').map((s) => s.offset).sort()).toEqual([0, 0, 0.5, 0.5]);
  });

  it('echo feeds the delay back through a gain below one', () => {
    const f = fake();
    buildChain(f.ctx, f.ctx.createGain(), 'echo');
    const d = f.kinds('delay')[0];
    const fb = f.kinds('gain').find((g) => f.has(d, g) && f.has(g, d))!;
    expect(fb.gain.value).toBeCloseTo(0.4);
    expect(d.delayTime.value).toBeCloseTo(0.25);
  });

  it('monster has a room: a convolver with a 1.2 s impulse', () => {
    const f = fake();
    buildChain(f.ctx, f.ctx.createGain(), 'monster', () => 0.5);
    expect(f.kinds('convolver')[0].buffer.length).toBe(1200);
    expect(f.kinds('shaper')).toHaveLength(1);
  });

  it('no voice ever reaches the speakers', () => {
    for (const p of VOICE_PRESETS) {
      const f = fake();
      buildChain(f.ctx, f.ctx.createGain(), p.id);
      expect(f.edges.some(([, to]) => to === f.ctx.destination), p.id).toBe(false);
    }
  });

  it('dispose disconnects every node it made', () => {
    const f = fake();
    const input = f.ctx.createGain();
    const n0 = f.made.length;
    const c = buildChain(f.ctx, input, 'monster');
    const mine = f.made.slice(n0);
    c.dispose();
    expect(f.edges.filter(([from]) => mine.includes(from))).toEqual([]);
  });
});

describe('VoiceEngine', () => {
  it('keeps one output stream across preset changes, so a running recording keeps its track', () => {
    const f = fake();
    const e = new VoiceEngine({ id: 'mic' } as any, 'none', () => f.ctx);
    const s = e.stream;
    e.setPreset('robot');
    e.setPreset('chipmunk');
    expect(e.stream).toBe(s);
    expect(f.kinds('dest')).toHaveLength(1);
  });

  it('routes mic to the recording destination, never to the speakers', () => {
    const f = fake();
    const e = new VoiceEngine({ id: 'mic' } as any, 'telephone', () => f.ctx);
    const dest = f.kinds('dest')[0];
    expect(f.edges.some(([, to]) => to === dest)).toBe(true);
    expect(f.edges.some(([, to]) => to === f.ctx.destination)).toBe(false);
    e.setPreset('none');
    expect(f.has(f.kinds('mic')[0], dest)).toBe(true);
  });

  it('level follows the mic volume', () => {
    const f = fake();
    const e = new VoiceEngine({ id: 'mic' } as any, 'none', () => f.ctx);
    expect(e.level()).toBe(0);
    f.ctx.signal = 0.5;
    expect(e.level()).toBeGreaterThan(0.4);
  });

  it('resume wakes a suspended context', async () => {
    const f = fake();
    const e = new VoiceEngine({ id: 'mic' } as any, 'none', () => f.ctx);
    await e.resume();
    expect(f.ctx.state).toBe('running');
  });
});
```

Create `src/audio/mic.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getMic, micState, resetMic, MIC_CONSTRAINTS } from './mic';

const stream = { id: 'mic' } as unknown as MediaStream;

describe('getMic', () => {
  beforeEach(() => resetMic());

  it('asks once for concurrent callers and keeps the stream', async () => {
    let calls = 0;
    const md = { getUserMedia: async (c: MediaStreamConstraints) => { calls++; expect(c).toEqual(MIC_CONSTRAINTS); return stream; } };
    const [a, b] = await Promise.all([getMic(md), getMic(md)]);
    expect(a).toBe(stream);
    expect(b).toBe(stream);
    expect(await getMic(md)).toBe(stream);
    expect(calls).toBe(1);
    expect(micState.value).toBe('live');
  });

  it('a refusal gives null and the denied state, without throwing', async () => {
    const md = { getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError'); } };
    expect(await getMic(md)).toBeNull();
    expect(micState.value).toBe('denied');
  });

  it('asks again after a refusal, so a changed permission works without a reload', async () => {
    let ok = false;
    const md = { getUserMedia: async () => { if (!ok) throw new Error('no'); return stream; } };
    expect(await getMic(md)).toBeNull();
    ok = true;
    expect(await getMic(md)).toBe(stream);
    expect(micState.value).toBe('live');
  });

  it('turns echo cancellation, noise suppression and auto gain on', () => {
    expect(MIC_CONSTRAINTS).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audio/engine.test.ts src/audio/mic.test.ts`
Expected: FAIL, cannot resolve `./engine` and `./mic`.

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/engine.ts`:

```ts
// The voice graph, native Web Audio nodes only (research/05): no AudioWorklet, no dependency.
// Nothing here ever connects to ctx.destination: the kid hears the effect in the recording or the mirror.
import { voiceParams, shiftParams, rampTable, fadeTable, distortionCurve, impulse, rms, nextLevel, WINDOW, type VoiceId } from './voice';

export class PitchShifter {
  readonly input: GainNode;
  readonly output: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private nodes: AudioNode[] = [];

  constructor(ctx: BaseAudioContext, semitones: number, window = WINDOW) {
    const p = shiftParams(semitones, window);
    const sr = ctx.sampleRate;
    const ramp = ctx.createBuffer(1, sr, sr); ramp.copyToChannel(rampTable(sr), 0);
    const fade = ctx.createBuffer(1, sr, sr); fade.copyToChannel(fadeTable(sr), 0);
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    for (const offset of [0, 0.5]) { // two taps, half a sweep apart (the tables are one second long)
      const delay = ctx.createDelay(window * 2);
      delay.delayTime.value = p.base;
      const rampSrc = ctx.createBufferSource(); rampSrc.buffer = ramp; rampSrc.loop = true; rampSrc.playbackRate.value = p.rate;
      const rampGain = ctx.createGain(); rampGain.gain.value = p.amp;
      rampSrc.connect(rampGain); rampGain.connect(delay.delayTime);
      const fadeSrc = ctx.createBufferSource(); fadeSrc.buffer = fade; fadeSrc.loop = true; fadeSrc.playbackRate.value = p.rate;
      const tap = ctx.createGain(); tap.gain.value = 0;
      fadeSrc.connect(tap.gain);
      this.input.connect(delay); delay.connect(tap); tap.connect(this.output);
      rampSrc.start(0, offset); fadeSrc.start(0, offset);
      this.sources.push(rampSrc, fadeSrc);
      this.nodes.push(delay, rampGain, tap);
    }
  }

  dispose(): void {
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } s.disconnect(); }
    for (const n of this.nodes) n.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}

export function buildChain(ctx: BaseAudioContext, input: AudioNode, id: VoiceId, rand: () => number = Math.random): { output: AudioNode; dispose(): void } {
  const p = voiceParams(id);
  const made: { disconnect(): void; stop?: () => void }[] = [];
  const add = <T extends AudioNode>(n: T): T => { made.push(n); return n; };
  let node: AudioNode = input;
  const chain = (n: AudioNode) => { node.connect(n); node = n; };

  if (p.semitones !== 0) {
    const s = new PitchShifter(ctx, p.semitones);
    made.push({ disconnect: () => s.dispose() });
    node.connect(s.input);
    node = s.output;
  }
  if (p.telephone) {
    for (const [type, hz] of [['lowpass', 2000], ['lowpass', 2000], ['highpass', 500], ['highpass', 500]] as const) {
      const b = add(ctx.createBiquadFilter());
      b.type = type; b.frequency.value = hz;
      chain(b);
    }
  }
  if (p.ringHz > 0) {
    const ring = add(ctx.createGain()); ring.gain.value = 0; // the oscillator is the whole gain: voice * sine
    const osc = add(ctx.createOscillator()); osc.type = 'sine'; osc.frequency.value = p.ringHz;
    osc.connect(ring.gain); osc.start();
    chain(ring);
  }
  if (p.distortion > 0) {
    const ws = add(ctx.createWaveShaper());
    ws.curve = distortionCurve(p.distortion) as Float32Array<ArrayBuffer>;
    ws.oversample = '2x';
    chain(ws);
  }
  if (p.echo) {
    const out = add(ctx.createGain());
    const d = add(ctx.createDelay(1)); d.delayTime.value = p.echo.delay;
    const fb = add(ctx.createGain()); fb.gain.value = p.echo.feedback;
    node.connect(out); node.connect(d); d.connect(fb); fb.connect(d); d.connect(out);
    node = out;
  }
  if (p.reverb > 0) {
    const out = add(ctx.createGain());
    const conv = add(ctx.createConvolver());
    const data = impulse(ctx.sampleRate, p.reverb, 3, rand);
    const ir = ctx.createBuffer(1, data.length, ctx.sampleRate); ir.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    conv.buffer = ir;
    const wet = add(ctx.createGain()); wet.gain.value = 0.35;
    node.connect(out); node.connect(conv); conv.connect(wet); wet.connect(out);
    node = out;
  }
  return {
    output: node,
    dispose() { for (const m of made) { try { m.stop?.(); } catch { /* not started */ } m.disconnect(); } },
  };
}

export class VoiceEngine {
  private ctx: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private dest: MediaStreamAudioDestinationNode;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private chain: { output: AudioNode; dispose(): void };
  private lvl = 0;

  // Default AudioContext options on purpose: a non-default latencyHint glitched on Android (research/05).
  constructor(mic: MediaStream, id: VoiceId, makeCtx: () => AudioContext = () => new AudioContext()) {
    this.ctx = makeCtx();
    this.source = this.ctx.createMediaStreamSource(mic);
    this.dest = this.ctx.createMediaStreamDestination();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser); // volume comes from the raw mic, before any effect
    this.chain = buildChain(this.ctx, this.source, id);
    this.chain.output.connect(this.dest);
  }

  get stream(): MediaStream { return this.dest.stream; }

  setPreset(id: VoiceId): void {
    this.source.disconnect();
    this.chain.dispose();
    this.source.connect(this.analyser);
    this.chain = buildChain(this.ctx, this.source, id);
    this.chain.output.connect(this.dest);
  }

  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    this.lvl = nextLevel(rms(this.buf), this.lvl);
    return this.lvl;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  dispose(): void {
    this.source.disconnect();
    this.chain.dispose();
    this.ctx.close().catch(() => {});
  }
}
```

Create `src/audio/mic.ts`:

```ts
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
```

Create `src/audio/session.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audio`
Expected: PASS for `voice.test.ts`, `engine.test.ts`, `mic.test.ts`.

If `npx tsc -b` rejects `Float32Array<ArrayBuffer>` casts, remove the cast that the compiler calls unnecessary and keep the one it needs. Do not change runtime behaviour.

- [ ] **Step 5: Commit**

```bash
npx vitest run && npx tsc -b
git add src/audio
git commit -m "feat: native-node voice engine and microphone at first need"
```

---

### Task 3: Recorder and record canvas

**Files:**
- Create: `src/capture/recorder.ts`, `src/capture/recordCanvas.ts`
- Test: `src/capture/recorder.test.ts`, `src/capture/recordCanvas.test.ts`

**Interfaces:**
- Consumes: `coverCrop(cw, ch, ew, eh)` from `src/capture/snapshot.ts`; `parseName` from `src/storage/gallery.ts` (tests only).
- Produces:
  - `MIME_ORDER: string[]`, `AUDIO_MIME_ORDER: string[]`, `MAX_MS = 60_000`
  - `pickMimeType(isSupported: (t: string) => boolean, order?: string[]): string | null`
  - `extFor(mime: string): 'mp4' | 'webm'`
  - `recordName(ext: string, now?: Date): string`
  - `evenSize(w: number, h: number): { width: number; height: number }`
  - `type RecCtor`, `class Recorder { constructor(Ctor: RecCtor, isSupported: (t: string) => boolean, opts?: { maxMs?: number; now?: () => Date; order?: string[]; bitsPerSecond?: number }); readonly active: boolean; start(stream: MediaStream, onAutoStop?: () => void): boolean; stop(): Promise<File | null> }`
  - `class RecordCanvas { readonly canvas: HTMLCanvasElement; constructor(stage: { width: number; height: number }, view: { width: number; height: number }, doc?: Pick<Document, 'createElement'>); draw(stage: CanvasImageSource): void; stream(fps?: number, audio?: MediaStream | null): MediaStream }`

- [ ] **Step 1: Write the failing tests**

Create `src/capture/recorder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MIME_ORDER, MAX_MS, pickMimeType, extFor, recordName, evenSize, Recorder, type RecCtor } from './recorder';
import { parseName } from '../storage/gallery';

class FakeRec {
  static last: FakeRec | null = null;
  static throwOnNew = false;
  static bytes = 10;
  state = 'inactive';
  timeslice: number | undefined = -1;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public stream: unknown, public options: MediaRecorderOptions) {
    if (FakeRec.throwOnNew) throw new Error('NotSupportedError');
    FakeRec.last = this;
  }
  start(timeslice?: number) { this.timeslice = timeslice; this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(FakeRec.bytes)]) });
    this.onstop?.();
  }
}
const Ctor = FakeRec as unknown as RecCtor;
const stream = { id: 's' } as unknown as MediaStream;
const all = () => true;
const webmOnly = (t: string) => t.startsWith('video/webm');

beforeEach(() => { FakeRec.last = null; FakeRec.throwOnNew = false; FakeRec.bytes = 10; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('mime selection', () => {
  it('prefers mp4 with H.264 and AAC, then plain mp4, then webm', () => {
    expect(MIME_ORDER).toEqual(['video/mp4;codecs="avc1.424028,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']);
    expect(pickMimeType(all)).toBe(MIME_ORDER[0]);
    expect(pickMimeType(webmOnly)).toBe('video/webm;codecs=vp9,opus');
    expect(pickMimeType(() => false)).toBeNull();
  });

  it('maps a mime type to the file extension', () => {
    expect(extFor('video/mp4;codecs="avc1.424028,mp4a.40.2"')).toBe('mp4');
    expect(extFor('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extFor('audio/mp4')).toBe('mp4');
  });
});

describe('recordName', () => {
  it('is a gallery name the store lists as a video', () => {
    const n = recordName('mp4', new Date(Date.UTC(2026, 8, 27, 10, 20, 30, 456)));
    expect(n).toBe('facemaker-2026-09-27T10-20-30-456Z.mp4');
    expect(parseName(n)?.type).toBe('video');
    expect(parseName(recordName('webm'))?.type).toBe('video');
  });
});

describe('evenSize', () => {
  it('rounds down to even numbers (H.264 needs them) and never below 2', () => {
    expect(evenSize(318.1, 720)).toEqual({ width: 318, height: 720 });
    expect(evenSize(319.9, 721)).toEqual({ width: 318, height: 720 });
    expect(evenSize(0, 1)).toEqual({ width: 2, height: 2 });
  });
});

describe('Recorder', () => {
  it('records without a timeslice at 4 Mbit and returns a named video file', async () => {
    const r = new Recorder(Ctor, all, { now: () => new Date(Date.UTC(2026, 8, 27, 10, 20, 30, 456)) });
    expect(r.start(stream)).toBe(true);
    expect(r.active).toBe(true);
    expect(FakeRec.last!.timeslice).toBeUndefined();
    expect(FakeRec.last!.options).toEqual({ mimeType: MIME_ORDER[0], videoBitsPerSecond: 4_000_000 });
    const f = await r.stop();
    expect(f?.name).toBe('facemaker-2026-09-27T10-20-30-456Z.mp4');
    expect(f?.type).toBe('video/mp4');
    expect(f?.size).toBe(10);
    expect(r.active).toBe(false);
  });

  it('falls back to webm when mp4 is not supported', async () => {
    const r = new Recorder(Ctor, webmOnly);
    r.start(stream);
    const f = await r.stop();
    expect(f?.name.endsWith('.webm')).toBe(true);
    expect(f?.type).toBe('video/webm');
  });

  it('start fails safely: no supported type, a constructor that throws, or a second start', () => {
    expect(new Recorder(Ctor, () => false).start(stream)).toBe(false);
    FakeRec.throwOnNew = true;
    const r = new Recorder(Ctor, all);
    expect(r.start(stream)).toBe(false);
    expect(r.active).toBe(false);
    FakeRec.throwOnNew = false;
    expect(r.start(stream)).toBe(true);
    expect(r.start(stream)).toBe(false);
  });

  it('stop before start gives null, and an empty recording gives null', async () => {
    expect(await new Recorder(Ctor, all).stop()).toBeNull();
    FakeRec.bytes = 0;
    const r = new Recorder(Ctor, all);
    r.start(stream);
    expect(await r.stop()).toBeNull();
  });

  it('calls the auto stop callback at the 60 s cap, not before, and not after a manual stop', async () => {
    expect(MAX_MS).toBe(60_000);
    const cb = vi.fn();
    const r = new Recorder(Ctor, all);
    r.start(stream, cb);
    vi.advanceTimersByTime(59_999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);

    const cb2 = vi.fn();
    const r2 = new Recorder(Ctor, all);
    r2.start(stream, cb2);
    await r2.stop();
    vi.advanceTimersByTime(120_000);
    expect(cb2).not.toHaveBeenCalled();
  });

  it('takes another type order and bitrate for audio-only use', async () => {
    const r = new Recorder(Ctor, (t) => t === 'audio/webm', { order: ['audio/webm;codecs=opus', 'audio/webm'], bitsPerSecond: 0, maxMs: 8000 });
    expect(r.start(stream)).toBe(true);
    expect(FakeRec.last!.options).toEqual({ mimeType: 'audio/webm' });
    expect((await r.stop())?.type).toBe('audio/webm');
  });
});
```

Create `src/capture/recordCanvas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RecordCanvas } from './recordCanvas';

function fakeDoc() {
  const calls: unknown[][] = [];
  const tracks: unknown[] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...a: unknown[]) => calls.push(a) }),
    captureStream: (fps: number) => ({ fps, addTrack: (t: unknown) => tracks.push(t) }),
  };
  return { doc: { createElement: () => canvas } as unknown as Pick<Document, 'createElement'>, canvas, calls, tracks };
}

describe('RecordCanvas', () => {
  it('has the size of what the screen shows, in even numbers', () => {
    const f = fakeDoc();
    // 1280x720 stage in a 380x860 view: full height, width 720 * 380 / 860 = 318.1
    new RecordCanvas({ width: 1280, height: 720 }, { width: 380, height: 860 }, f.doc);
    expect([f.canvas.width, f.canvas.height]).toEqual([318, 720]);
  });

  it('draws the visible crop of the stage over the whole record canvas', () => {
    const f = fakeDoc();
    const stage = { width: 1280, height: 720 };
    const rc = new RecordCanvas(stage, { width: 380, height: 860 }, f.doc);
    rc.draw(stage as unknown as CanvasImageSource);
    const [src, sx, sy, sw, sh, dx, dy, dw, dh] = f.calls[0] as number[];
    expect(src).toBe(stage);
    expect(sx).toBeCloseTo((1280 - 720 * 380 / 860) / 2, 6);
    expect(sy).toBe(0);
    expect(sw).toBeCloseTo(720 * 380 / 860, 6);
    expect(sh).toBe(720);
    expect([dx, dy, dw, dh]).toEqual([0, 0, 318, 720]);
  });

  it('streams at 30 fps and adds the voice track when there is one', () => {
    const f = fakeDoc();
    const rc = new RecordCanvas({ width: 640, height: 480 }, { width: 640, height: 480 }, f.doc);
    const track = { kind: 'audio' };
    const s = rc.stream(30, { getAudioTracks: () => [track] } as unknown as MediaStream) as unknown as { fps: number };
    expect(s.fps).toBe(30);
    expect(f.tracks).toEqual([track]);
  });

  it('streams video only when the mic is missing or denied', () => {
    const f = fakeDoc();
    const rc = new RecordCanvas({ width: 640, height: 480 }, { width: 640, height: 480 }, f.doc);
    rc.stream(30, null);
    rc.stream(30, { getAudioTracks: () => [] } as unknown as MediaStream);
    expect(f.tracks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/capture/recorder.test.ts src/capture/recordCanvas.test.ts`
Expected: FAIL, cannot resolve `./recorder` and `./recordCanvas`.

- [ ] **Step 3: Write minimal implementation**

Create `src/capture/recorder.ts`:

```ts
// MediaRecorder wrapper. mp4 first (Chrome 126+ on Android), webm fallback. No timeslice: one blob at
// stop, and WebM then carries its Duration (Chrome 140+, research/05).
export const MIME_ORDER = ['video/mp4;codecs="avc1.424028,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
export const AUDIO_MIME_ORDER = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
export const MAX_MS = 60_000;

export function pickMimeType(isSupported: (t: string) => boolean, order: string[] = MIME_ORDER): string | null {
  return order.find((t) => isSupported(t)) ?? null;
}

export function extFor(mime: string): 'mp4' | 'webm' {
  return mime.split(';')[0].endsWith('/mp4') ? 'mp4' : 'webm';
}

export function recordName(ext: string, now: Date = new Date()): string {
  return `facemaker-${now.toISOString().replace(/[:.]/g, '-')}.${ext}`;
}

export function evenSize(w: number, h: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(w), height: even(h) };
}

type Rec = {
  state: string;
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};
export type RecCtor = new (stream: MediaStream, options: MediaRecorderOptions) => Rec;
export type RecorderOptions = { maxMs?: number; now?: () => Date; order?: string[]; bitsPerSecond?: number };

export class Recorder {
  private rec: Rec | null = null;
  private done: Promise<File | null> = Promise.resolve(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private maxMs: number;
  private now: () => Date;
  private order: string[];
  private bits: number;

  constructor(private Ctor: RecCtor, private isSupported: (t: string) => boolean, opts: RecorderOptions = {}) {
    this.maxMs = opts.maxMs ?? MAX_MS;
    this.now = opts.now ?? (() => new Date());
    this.order = opts.order ?? MIME_ORDER;
    this.bits = opts.bitsPerSecond ?? 4_000_000;
  }

  get active(): boolean { return this.rec !== null; }

  start(stream: MediaStream, onAutoStop?: () => void): boolean {
    if (this.rec) return false;
    const mime = pickMimeType(this.isSupported, this.order);
    if (!mime) return false;
    try {
      const options: MediaRecorderOptions = { mimeType: mime };
      if (this.bits > 0) options.videoBitsPerSecond = this.bits;
      const rec = new this.Ctor(stream, options);
      const chunks: Blob[] = [];
      const name = recordName(extFor(mime), this.now());
      const type = mime.split(';')[0];
      this.done = new Promise((resolve) => {
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => resolve(chunks.length ? new File(chunks, name, { type }) : null);
        rec.onerror = () => resolve(null);
      });
      rec.start();
      this.rec = rec;
      this.timer = setTimeout(() => onAutoStop?.(), this.maxMs);
      return true;
    } catch (e) {
      console.warn('recorder start failed', e);
      this.rec = null;
      return false;
    }
  }

  async stop(): Promise<File | null> {
    const rec = this.rec;
    if (!rec) return null;
    clearTimeout(this.timer);
    this.rec = null;
    try { if (rec.state !== 'inactive') rec.stop(); } catch { return null; }
    return this.done;
  }
}
```

Create `src/capture/recordCanvas.ts`:

```ts
import { coverCrop, type Crop } from './snapshot';
import { evenSize } from './recorder';

// captureStream records a whole canvas, and the stage canvas is wider than what the screen shows
// (object-fit: cover). This second canvas holds exactly the visible crop, so videos match photos.
export class RecordCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private crop: Crop;

  constructor(stage: { width: number; height: number }, view: { width: number; height: number }, doc: Pick<Document, 'createElement'> = document) {
    this.crop = coverCrop(stage.width, stage.height, view.width, view.height);
    const s = evenSize(this.crop.w, this.crop.h);
    this.canvas = doc.createElement('canvas') as HTMLCanvasElement;
    this.canvas.width = s.width;
    this.canvas.height = s.height;
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(stage: CanvasImageSource): void {
    const c = this.crop;
    this.ctx.drawImage(stage, c.x, c.y, c.w, c.h, 0, 0, this.canvas.width, this.canvas.height);
  }

  stream(fps = 30, audio: MediaStream | null = null): MediaStream {
    const s = this.canvas.captureStream(fps);
    const track = audio?.getAudioTracks()[0];
    if (track) s.addTrack(track);
    return s;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/capture`
Expected: PASS for `recorder.test.ts`, `recordCanvas.test.ts`, and the existing `share.test.ts`, `snapshot.test.ts`.

- [ ] **Step 5: Commit**

```bash
npx vitest run && npx tsc -b
git add src/capture/recorder.ts src/capture/recorder.test.ts src/capture/recordCanvas.ts src/capture/recordCanvas.test.ts
git commit -m "feat: recorder with mp4 first and a cropped record canvas"
```

---

### Task 4: Gallery and viewer play videos

**Files:**
- Modify: `src/storage/gallery.ts` (add `mimeForName`, `makeThumb`; `MemoryStore` and `OpfsStore` pass the name)
- Modify: `src/app/Viewer.tsx` (video element, no Edit for videos)
- Modify: `src/app/styles.css` (video in the viewer)
- Test: `src/storage/gallery.test.ts` (append)

**Interfaces:**
- Produces: `mimeForName(name: string): string`; `makeThumb(blob: Blob, name: string): Promise<Blob>` (browser only); `MemoryStore` constructor parameter becomes `(makeThumb: (b: Blob, name: string) => Promise<Blob>)`.

- [ ] **Step 1: Write the failing test**

Append to `src/storage/gallery.test.ts` (and add `mimeForName` to the import from `./gallery`):

```ts
describe('video support', () => {
  it('knows the mime type from the file name, because OPFS files carry none', () => {
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.jpg')).toBe('image/jpeg');
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.mp4')).toBe('video/mp4');
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.webm')).toBe('video/webm');
    expect(mimeForName('notes.txt')).toBe('application/octet-stream');
  });

  it('hands the file name to the thumbnail maker, so a video gets a frame grab', async () => {
    const seen: string[] = [];
    const s = new MemoryStore(async (b, name) => { seen.push(name); return b; });
    await s.put('facemaker-2026-09-27T10-20-30-456Z.mp4', blob(30));
    await s.thumb('facemaker-2026-09-27T10-20-30-456Z.mp4');
    await s.thumb('facemaker-2026-09-27T10-20-30-456Z.mp4'); // cached
    expect(seen).toEqual(['facemaker-2026-09-27T10-20-30-456Z.mp4']);
  });

  it('lists a saved video as a video', async () => {
    const s = new MemoryStore();
    await s.put('facemaker-2026-09-27T10-20-30-456Z.webm', blob(30));
    expect((await s.list())[0].type).toBe('video');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/gallery.test.ts`
Expected: FAIL, `mimeForName` is not exported (and the name argument is `undefined`).

- [ ] **Step 3: Write minimal implementation**

In `src/storage/gallery.ts`, after `parseName`, add:

```ts
export function mimeForName(name: string): string {
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}
```

After `makeThumbJpeg`, add:

```ts
// Browser only: a frame a little after the start (first frames can be black), as a 256 px JPEG.
async function videoFrameJpeg(blob: Blob, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video thumb: load failed')); });
    await new Promise<void>((res) => {
      const t = setTimeout(res, 1500); // a seek that never lands must not hang the gallery
      v.onseeked = () => { clearTimeout(t); res(); };
      v.currentTime = Math.min(0.1, (Number.isFinite(v.duration) ? v.duration : 1) / 2);
    });
    const k = size / Math.max(v.videoWidth, v.videoHeight, 1);
    const c = new OffscreenCanvas(Math.max(1, Math.round(v.videoWidth * k)), Math.max(1, Math.round(v.videoHeight * k)));
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeThumb(blob: Blob, name: string): Promise<Blob> {
  const type = mimeForName(name);
  if (type.startsWith('video/')) return videoFrameJpeg(new Blob([blob], { type }));
  return makeThumbJpeg(blob);
}
```

In `MemoryStore`: change the constructor to
`constructor(private makeThumb: (b: Blob, name: string) => Promise<Blob> = async (b) => b) {}`
and in `thumb` change `await this.makeThumb(b)` to `await this.makeThumb(b, name)`.

In `OpfsStore.thumb`: change `await makeThumbJpeg(full)` to `await makeThumb(full, name)`.

In `openStore`: change `new MemoryStore(makeThumbJpeg)` to `new MemoryStore(makeThumb)`.

In `src/app/Viewer.tsx`:
- import `mimeForName`: `import { mimeForName } from '../storage/gallery';`
- replace the File creation: `const f = new File([b], name, { type: mimeForName(name) });`
- after the hooks add `const isVideo = mimeForName(name).startsWith('video/');`
- replace `{url && <img class="full" src={url} alt="" />}` with:

```tsx
      {url && (isVideo
        ? <video class="full" src={url} controls playsInline autoPlay loop />
        : <img class="full" src={url} alt="" />)}
```

- replace the Edit button line with:

```tsx
        {!isVideo && <button class="round" aria-label={t('viewer.edit')} disabled={!file} onClick={() => (screen.value = 'editor')}>✏️</button>}
```

In `src/app/styles.css`, append:

```css
video.full { background: #000; bottom: calc(var(--tap) + 32px + env(safe-area-inset-bottom)); height: auto; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/gallery.test.ts`
Expected: PASS, including the three new tests.

- [ ] **Step 5: Commit**

```bash
npx vitest run && npx tsc -b
git add src/storage/gallery.ts src/storage/gallery.test.ts src/app/Viewer.tsx src/app/styles.css
git commit -m "feat: gallery thumbnails and viewer playback for videos"
```

---

### Task 5: Hold the shutter to record

**Files:**
- Create: `src/app/hold.ts`
- Test: `src/app/hold.test.ts`
- Modify: `src/app/state.ts` (signals `recording`, `voice`; `DockTab` gets `'voice'`)
- Modify: `src/app/CaptureButton.tsx` (pointer handlers, ring, flip and gallery disabled while recording)
- Modify: `src/app/App.tsx` (record flow, record canvas in the render loop, `visibilitychange`)
- Modify: `src/app/styles.css` (recording look)

**Interfaces:**
- Consumes: `Recorder`, `RecCtor` from `src/capture/recorder.ts`; `RecordCanvas` from `src/capture/recordCanvas.ts`; `ensureVoice`, `currentEngine` from `src/audio/session.ts`; `VoiceId` from `src/audio/voice.ts`; `safePut` from `src/storage/gallery.ts`.
- Produces: `type HoldEvent = 'tap' | 'holdStart' | 'holdEnd'`; `createHold(onEvent: (e: HoldEvent) => void, thresholdMs?: number): { down(): void; up(): void; cancel(): void }`; signals `recording: Signal<boolean>`, `voice: Signal<VoiceId>`; `DockTab` includes `'voice'`.

- [ ] **Step 1: Write the failing test**

Create `src/app/hold.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHold, type HoldEvent } from './hold';

let events: HoldEvent[];
const mk = () => createHold((e) => events.push(e), 350);

beforeEach(() => { events = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('createHold', () => {
  it('a short press is a tap', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(200); h.up();
    expect(events).toEqual(['tap']);
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(['tap']);
  });

  it('a long press starts a hold at the threshold and ends it on release', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(349);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(['holdStart']);
    vi.advanceTimersByTime(5000); h.up();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('a cancelled short press does nothing: no photo when the finger slides off', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(100); h.cancel();
    vi.advanceTimersByTime(1000);
    expect(events).toEqual([]);
  });

  it('a cancelled hold still ends, so a recording never runs on', () => {
    const h = mk();
    h.down(); vi.advanceTimersByTime(400); h.cancel();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('ignores a second down and a stray up', () => {
    const h = mk();
    h.up(); h.cancel();
    h.down(); h.down(); vi.advanceTimersByTime(400); h.up(); h.up();
    expect(events).toEqual(['holdStart', 'holdEnd']);
  });

  it('works again after each gesture', () => {
    const h = mk();
    h.down(); h.up();
    h.down(); vi.advanceTimersByTime(400); h.up();
    h.down(); h.up();
    expect(events).toEqual(['tap', 'holdStart', 'holdEnd', 'tap']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/hold.test.ts`
Expected: FAIL, cannot resolve `./hold`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/hold.ts`:

```ts
export type HoldEvent = 'tap' | 'holdStart' | 'holdEnd';

// Tap or hold on one button. Short press: 'tap' on release. Long press: 'holdStart' at the threshold,
// 'holdEnd' on release or cancel. A cancelled short press is nothing.
export function createHold(onEvent: (e: HoldEvent) => void, thresholdMs = 350): { down(): void; up(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pressed = false, holding = false;
  const end = (tap: boolean) => {
    if (!pressed) return;
    pressed = false;
    if (timer !== null) { clearTimeout(timer); timer = null; if (tap) onEvent('tap'); }
    else if (holding) { holding = false; onEvent('holdEnd'); }
  };
  return {
    down() {
      if (pressed) return;
      pressed = true; holding = false;
      timer = setTimeout(() => { timer = null; holding = true; onEvent('holdStart'); }, thresholdMs);
    },
    up() { end(true); },
    cancel() { end(false); },
  };
}
```

In `src/app/state.ts`:
- add the import `import type { VoiceId } from '../audio/voice';`
- change `export type DockTab = 'warp' | 'sticker' | 'text' | 'lab';` to `export type DockTab = 'warp' | 'sticker' | 'text' | 'voice' | 'lab';`
- append:

```ts
export const recording = signal(false); // a video is being recorded
export const voice = signal<VoiceId>('none');
```

Replace `src/app/CaptureButton.tsx` with:

```tsx
import { useMemo } from 'preact/hooks';
import { busy, galleryThumb, recording } from './state';
import { createHold, type HoldEvent } from './hold';

export function CaptureButton({ onShutter, onFlip, onGallery }: { onShutter: (e: HoldEvent) => void; onFlip: () => void; onGallery: () => void }) {
  const hold = useMemo(() => createHold(onShutter), []);
  const rec = recording.value;
  return (
    <div class="bar">
      <button class="round flip" aria-label="flip camera" disabled={rec} onClick={onFlip}>🔄</button>
      <button
        class={'round shutter' + (rec ? ' rec' : '')}
        aria-label="take photo"
        aria-pressed={rec}
        disabled={busy.value && !rec}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hold.down(); }}
        onPointerUp={() => hold.up()}
        onPointerCancel={() => hold.cancel()}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) onShutter('tap'); }}
      >
        {rec && <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" /></svg>}
      </button>
      <button class={'round gallery-btn' + (galleryThumb.value ? ' has-thumb' : '')} aria-label="gallery" disabled={rec} onClick={onGallery}>{galleryThumb.value ? <img src={galleryThumb.value} alt="" /> : '🖼️'}</button>
    </div>
  );
}
```

Notes for the implementer: `onClick` with `e.detail === 0` keeps keyboard activation (Enter or Space) working; pointer taps arrive through `createHold`. `onShutter` is read once by `useMemo`, so `App` must pass a stable function (see below).

In `src/app/App.tsx`:

1. Imports: add
```ts
import { Recorder, type RecCtor } from '../capture/recorder';
import { RecordCanvas } from '../capture/recordCanvas';
import { ensureVoice, currentEngine } from '../audio/session';
import type { HoldEvent } from './hold';
```
and add `recording, voice` to the import from `./state`.

2. Inside `App()`, below the two `useRef` lines, add:
```ts
  const recCanvas = useRef<RecordCanvas | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const holding = useRef(false);
```

3. In the `useEffect` debug counters line, add `clips: 0`:
```ts
    const fm = ((globalThis as any).__fm = { frames: 0, faces: 0, delegate: '', shots: 0, clips: 0 });
```

4. In `loop`, after `r.render();` add:
```ts
      recCanvas.current?.draw(canvas); // while recording: copy the visible crop for the recorder
```

5. In the `useEffect`, before `return () => {`, add the background stop and extend the cleanup. The effect closure runs before `stopRec` exists in source order, so it goes through the `shutter` ref defined in step 6:
```ts
    const onHide = () => { if (document.hidden) { holding.current = false; shutter.current('holdEnd'); } };
    document.addEventListener('visibilitychange', onHide);
```
and change the cleanup to:
```ts
    return () => { document.removeEventListener('visibilitychange', onHide); unsub(); cancelAnimationFrame(raf); t.stop(); r.dispose(); stopCamera(video); };
```

6. Replace the body of `capture` from `const saved = ...` to the end of the `if (saved) { ... } else { ... }` block with a call to a shared helper, and add the helper and the record flow above `capture`:

```ts
  // Saved: the picture flies into the gallery button. Not saved (no device storage): hand the file over.
  const keep = async (file: File, counter: 'shots' | 'clips') => {
    const saved = !!store.value && (await safePut(store.value, file.name, file));
    if (!saved) { await shareOrDownload(file); return; }
    (globalThis as any).__fm[counter]++;
    const thumb = file.type.startsWith('video/') ? await store.value!.thumb(file.name).catch(() => null) : file;
    if (thumb) {
      const url = URL.createObjectURL(thumb);
      flyShot.value = url;
      setTimeout(() => { flyShot.value = null; if (galleryThumb.value) URL.revokeObjectURL(galleryThumb.value); galleryThumb.value = url; }, 700);
    }
    if (!file.type.startsWith('video/')) store.value!.thumb(file.name).catch(() => {});
    refreshGallery().catch(() => {});
  };

  const startRec = async () => {
    if (busy.value || recording.value || camState.value !== 'live' || typeof MediaRecorder === 'undefined') return;
    const stage = canvasRef.current!;
    const rect = stage.getBoundingClientRect();
    const engine = await ensureVoice(voice.value); // mic at first need. null when refused: a silent video
    if (!holding.current) return; // released while the permission prompt was open
    const rc = new RecordCanvas(stage, { width: rect.width, height: rect.height });
    rc.draw(stage);
    recorder.current ??= new Recorder(MediaRecorder as unknown as RecCtor, (t) => MediaRecorder.isTypeSupported(t));
    if (!recorder.current.start(rc.stream(30, engine?.stream ?? null), () => stopRec())) return;
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
      setTimeout(() => (busy.value = false), 500);
    }
  };

  const shutter = useRef((_e: HoldEvent) => {});
  shutter.current = (e) => {
    if (e === 'tap') capture();
    else if (e === 'holdStart') { holding.current = true; startRec(); }
    else { holding.current = false; stopRec(); }
  };
  const onShutter = useRef((e: HoldEvent) => shutter.current(e)).current; // stable for CaptureButton
```

The new `capture` body:

```ts
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
```

7. In the JSX, change the `CaptureButton` line to:
```tsx
          <CaptureButton onShutter={onShutter} onFlip={() => (facing.value = facing.value === 'user' ? 'environment' : 'user')} onGallery={() => { dockOpen.value = false; refreshGallery().catch(() => {}); screen.value = 'gallery'; }} />
```
and hide the dock and the gear while recording:
```tsx
          {!recording.value && <TopBar />}
          {screen.value === 'camera' && !recording.value && <Dock />}
```

In `src/app/styles.css`, append:

```css
.shutter { position: relative; touch-action: none; user-select: none; -webkit-user-select: none; }
.shutter.rec { background: #e53935; transform: scale(1.12); }
.shutter .ring { position: absolute; inset: -10px; width: calc(100% + 20px); height: calc(100% + 20px); transform: rotate(-90deg); pointer-events: none; }
.shutter .ring circle { fill: none; stroke: #fff; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 289; stroke-dashoffset: 289; animation: rec-ring 60s linear forwards; }
@keyframes rec-ring { to { stroke-dashoffset: 0; } }
.round:disabled { opacity: .4; }
```

(`289` is the circle length for r = 46: 2 * pi * 46.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc -b`
Expected: PASS, all files green, `tsc` prints nothing.

Then run the app check: `npm run build` (must succeed).

- [ ] **Step 5: Commit**

```bash
git add src/app/hold.ts src/app/hold.test.ts src/app/state.ts src/app/CaptureButton.tsx src/app/App.tsx src/app/styles.css
git commit -m "feat: hold the shutter to record a video"
```

---

### Task 6: Voice tab, voice mirror, shout preset

**Files:**
- Create: `src/app/VoicePanel.tsx`
- Modify: `src/app/Dock.tsx` (voice tab; shout asks for the mic)
- Modify: `src/filters/presets.ts` (`shout`, `level` parameter)
- Modify: `src/app/App.tsx` (level into `handlesFor`)
- Modify: `src/i18n/en.json`, `src/i18n/sr.json`
- Modify: `src/app/styles.css`
- Modify: `scripts/smoke.mjs` line `const RAIL = new Set([...])` (add `'voice'`)
- Test: `src/filters/presets.test.ts` (append)

**Interfaces:**
- Consumes: `VOICE_PRESETS`, `VoiceId` (Task 1); `ensureVoice`, `currentEngine` (Task 2); `micState` (Task 2); `Recorder`, `AUDIO_MIME_ORDER`, `RecCtor` (Task 3); `createHold` (Task 5); `voice` signal (Task 5).
- Produces: `PresetId` includes `'shout'`; `handlesFor(preset: PresetId, faces: Face[], aspect: number, level?: number): Handle[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/filters/presets.test.ts`:

```ts
describe('shout', () => {
  it('is in the strip', () => {
    expect(PRESETS.map((p) => p.id)).toContain('shout');
  });

  it('does nothing in silence', () => {
    expect(handlesFor('shout', [face()], 16 / 9, 0)).toEqual([]);
    expect(handlesFor('shout', [face()], 16 / 9)).toEqual([]);
  });

  it('grows the mouth and the head with the voice level', () => {
    const loud = handlesFor('shout', [face()], 16 / 9, 1);
    expect(loud).toHaveLength(2);
    expect(loud[0].cx).toBeCloseTo(0.5, 4); expect(loud[0].cy).toBeCloseTo(0.63, 4); // mouth
    expect(loud[0].strength).toBeCloseTo(0.9, 6);
    expect(loud[1].strength).toBeCloseTo(0.45, 6);
    const half = handlesFor('shout', [face()], 16 / 9, 0.5);
    expect(half[0].strength).toBeCloseTo(0.45, 6);
    expect(half[1].strength).toBeCloseTo(0.225, 6);
  });

  it('clamps a level above one', () => {
    expect(handlesFor('shout', [face()], 16 / 9, 7)[0].strength).toBeCloseTo(0.9, 6);
  });

  it('the level does not change other presets', () => {
    expect(handlesFor('bigEyes', [face()], 16 / 9, 0)).toEqual(handlesFor('bigEyes', [face()], 16 / 9, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/filters/presets.test.ts`
Expected: FAIL, `shout` missing from `PRESETS` and no handles returned.

- [ ] **Step 3: Write minimal implementation**

In `src/filters/presets.ts`:
- `PresetId`: add `| 'shout'` at the end of the union.
- `PRESETS`: append `{ id: 'shout', icon: '📣' },`.
- `faceHandles` signature: `function faceHandles(preset: PresetId, lm: Float32Array, aspect: number, level: number): Handle[]`.
- add before `default:`:

```ts
    case 'shout': { // mic volume drives it: see App.tsx
      const l = Math.min(1, Math.max(0, level));
      if (l === 0) return [];
      return [
        { cx: mouth[0], cy: mouth[1], r: width * 0.4, strength: 0.9 * l, type: 0 },
        { cx, cy: (ty + by) / 2, r: Math.max(width, heightX) * 0.95, strength: 0.45 * l, type: 0 },
      ];
    }
```

- `handlesFor`:

```ts
export function handlesFor(preset: PresetId, faces: Face[], aspect: number, level = 0): Handle[] {
  if (preset === 'none' || faces.length === 0) return [];
  return faces.flatMap((f) => faceHandles(preset, f.landmarks, aspect, level));
}
```

In `src/app/App.tsx`, in `loop`, replace the `r.setHandles(...)` line with:

```ts
      const level = preset.value === 'shout' ? currentEngine()?.level() ?? 0 : 0;
      r.setHandles([...handlesFor(preset.value, faces, aspect, level), ...sliderHandles(sliders.value, faces, aspect, now)]);
```

Create `src/app/VoicePanel.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'preact/hooks';
import { voice } from './state';
import { Strip } from './Strip';
import { createHold } from './hold';
import { VOICE_PRESETS, type VoiceId } from '../audio/voice';
import { ensureVoice } from '../audio/session';
import { micState } from '../audio/mic';
import { Recorder, AUDIO_MIME_ORDER, type RecCtor } from '../capture/recorder';
import { t } from '../i18n/i18n';

type Mirror = 'idle' | 'rec' | 'play';

// Voice strip plus the voice mirror: hold the microphone, talk, let go, hear it back changed.
// Record then play: the mic never feeds the speaker, so nothing can howl.
export function VoicePanel() {
  const [mirror, setMirror] = useState<Mirror>('idle');
  useEffect(() => { ensureVoice(voice.value).catch(() => {}); }, []); // opening the tab is the first need

  const hold = useMemo(() => {
    let rec: Recorder | null = null;
    let held = false;
    const play = async () => {
      const file = await rec?.stop();
      if (!file) { setMirror('idle'); return; }
      const url = URL.createObjectURL(file);
      const a = new Audio(url);
      const done = () => { URL.revokeObjectURL(url); setMirror('idle'); };
      a.onended = done; a.onerror = done;
      setMirror('play');
      a.play().catch(done);
    };
    return createHold(async (e) => {
      if (e === 'tap') return;
      if (e === 'holdEnd') { held = false; if (rec?.active) await play(); return; }
      held = true;
      if (typeof MediaRecorder === 'undefined') return;
      const engine = await ensureVoice(voice.value);
      if (!engine || !held) return;
      rec = new Recorder(MediaRecorder as unknown as RecCtor, (m) => MediaRecorder.isTypeSupported(m), { order: AUDIO_MIME_ORDER, bitsPerSecond: 0, maxMs: 8000 });
      if (rec.start(engine.stream, () => play())) setMirror('rec');
    }, 150);
  }, []);

  const pick = (id: string) => { voice.value = id as VoiceId; ensureVoice(voice.value).catch(() => {}); };
  const denied = micState.value === 'denied';
  return (
    <div class="voice">
      <Strip items={VOICE_PRESETS} value={voice.value} onPick={pick} label={t('tabs.voice')} />
      {denied
        ? <p class="line small" role="status">🔒🎤 {t('voice.denied')}</p>
        : (
          <button
            class={'round mirror' + (mirror !== 'idle' ? ' ' + mirror : '')}
            aria-label="voice mirror"
            title={t('voice.try')}
            disabled={mirror === 'play'}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hold.down(); }}
            onPointerUp={() => hold.up()}
            onPointerCancel={() => hold.cancel()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {mirror === 'rec' ? '⏺️' : mirror === 'play' ? '🔊' : '🎤'}
          </button>
        )}
    </div>
  );
}
```

In `src/app/Dock.tsx`:
- imports: add `import { VoicePanel } from './VoicePanel';` and `import { ensureVoice } from '../audio/session';`, and add `voice` to the import from `./state`.
- `TABS`: insert `{ id: 'voice', icon: '🎤' },` before the `lab` entry.
- the warp `Strip` `onPick` becomes:

```tsx
onPick={(id) => { preset.value = id as typeof preset.value; if (id !== 'none') sliders.value = DEFAULT_SLIDERS; if (id === 'shout') ensureVoice(voice.value).catch(() => {}); }}
```

- after the `text` line add: `{tab === 'voice' && <VoicePanel />}`

In `src/i18n/en.json` add:

```json
  "tabs.voice": "Voice",
  "voice.try": "Hold and talk",
  "voice.denied": "Microphone is off. Allow it in the browser settings."
```

In `src/i18n/sr.json` add:

```json
  "tabs.voice": "Glas",
  "voice.try": "Drži i pričaj",
  "voice.denied": "Mikrofon je isključen. Dozvoli ga u podešavanjima pregledača."
```

In `src/app/styles.css`, append:

```css
.voice { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.mirror { touch-action: none; user-select: none; -webkit-user-select: none; font-size: 28px; }
.mirror.rec { background: #e53935; transform: scale(1.1); }
.mirror.play { background: var(--accent); }
```

In `scripts/smoke.mjs`, change
`const RAIL = new Set(['warp', 'sticker', 'text', 'lab']);`
to
`const RAIL = new Set(['warp', 'sticker', 'text', 'voice', 'lab']);`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: PASS, `tsc` silent, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/VoicePanel.tsx src/app/Dock.tsx src/filters/presets.ts src/filters/presets.test.ts src/app/App.tsx src/i18n/en.json src/i18n/sr.json src/app/styles.css scripts/smoke.mjs
git commit -m "feat: voice tab with voice mirror, shout preset driven by the mic"
```

---

### Task 7: Tutorial step and privacy text

**Files:**
- Modify: `src/app/tutorialState.ts`, `src/app/tutorialState.test.ts`
- Modify: `src/app/About.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/sr.json`
- Test: `src/i18n/i18n.test.ts` (append)

**Interfaces:**
- Produces: `STEPS` has five entries; the third is `{ icon: '⚪', key: 'tutorial.shutter' }`, the fourth `{ icon: '🎥', key: 'tutorial.record' }`.

- [ ] **Step 1: Write the failing tests**

In `src/app/tutorialState.test.ts`, replace the first test with:

```ts
  it('has five steps with icons and i18n keys, the video step right after the photo step', () => {
    expect(STEPS).toHaveLength(5);
    for (const s of STEPS) { expect(s.icon.length).toBeGreaterThan(0); expect(s.key.startsWith('tutorial.')).toBe(true); }
    expect(STEPS.map((s) => s.key)).toEqual(['tutorial.filters', 'tutorial.stickers', 'tutorial.shutter', 'tutorial.record', 'tutorial.share']);
  });
```

Append to `src/i18n/i18n.test.ts` inside the `describe`:

```ts
  it('every tutorial step and the privacy lines have text in both languages', () => {
    for (const k of ['tutorial.record', 'privacy.p4', 'privacy.p5', 'tabs.voice', 'voice.try', 'voice.denied']) {
      expect((en as Record<string, string>)[k], `en ${k}`).toBeTruthy();
      expect((sr as Record<string, string>)[k], `sr ${k}`).toBeTruthy();
    }
  });

  it('the privacy page tells the truth about storage: photos and videos stay on the device', () => {
    expect((en as Record<string, string>)['privacy.p4']).not.toMatch(/does not keep/i);
    expect((en as Record<string, string>)['privacy.p4']).toMatch(/on this device/i);
    expect((en as Record<string, string>)['privacy.p5']).toMatch(/microphone/i);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/tutorialState.test.ts src/i18n/i18n.test.ts`
Expected: FAIL, four steps found; `tutorial.record` and `privacy.p5` missing; `privacy.p4` says "does not keep".

- [ ] **Step 3: Write minimal implementation**

In `src/app/tutorialState.ts`, `STEPS` becomes:

```ts
export const STEPS = [
  { icon: '✨', key: 'tutorial.filters' },
  { icon: '🐱', key: 'tutorial.stickers' },
  { icon: '⚪', key: 'tutorial.shutter' },
  { icon: '🎥', key: 'tutorial.record' },
  { icon: '📤', key: 'tutorial.share' },
];
```

In `src/i18n/en.json`: add `"tutorial.record": "Hold the big button to make a video",` and `"privacy.p5": "The microphone is on only while you record a video or try a voice. The sound stays on this device.",` and replace the value of `privacy.p4` with:
`"Photos and videos you take are kept on this device, in the app's own storage. Delete them in the gallery or in settings."`

In `src/i18n/sr.json`: add `"tutorial.record": "Drži veliko dugme da snimiš video",` and `"privacy.p5": "Mikrofon radi samo dok snimaš video ili isprobavaš glas. Zvuk ostaje na ovom uređaju.",` and replace the value of `privacy.p4` with:
`"Slike i snimci koje napraviš čuvaju se na ovom uređaju, u skladištu aplikacije. Obriši ih u galeriji ili u podešavanjima."`

In `src/app/About.tsx`, after the line `<p class="line">{t('privacy.p4')}</p>` add:

```tsx
      <p class="line">{t('privacy.p5')}</p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/tutorialState.ts src/app/tutorialState.test.ts src/app/About.tsx src/i18n/en.json src/i18n/sr.json src/i18n/i18n.test.ts
git commit -m "feat: tutorial step for video, privacy text for storage and microphone"
```

---

### Task 8: Smoke check for recording, docs

**Files:**
- Modify: `scripts/smoke.mjs` (env `SMOKE_RECORD`)
- Modify: `README.md`, `CLAUDE.md`, `TODO.md`, `docs/SPEC.md`

**Interfaces:**
- Consumes: `globalThis.__fm.clips` (Task 5), aria-labels `take photo`, `gallery`, `voice`, `robot`, `Save`.

- [ ] **Step 1: Add the smoke block**

In `scripts/smoke.mjs`, add to the header comment:

```js
//   SMOKE_RECORD    1: pick the robot voice, hold the shutter 2.5 s, expect one video in the gallery with a video and an audio stream
```

Insert before the line `// Shutter: a double tap must produce exactly one file.`:

```js
// SMOKE_RECORD=1: hold the shutter, expect a playable clip with sound (the fake device has a microphone)
if (process.env.SMOKE_RECORD) {
  const support = await page.evaluate(() => ['video/mp4;codecs="avc1.424028,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].map((t) => `${t}=${MediaRecorder.isTypeSupported(t)}`));
  console.log('recorder types:', support.join(' | '));
  await click('voice'); await click('robot');
  if (out) writeFileSync(`${out}/page-voice.png`, await page.screenshot());
  await page.locator('canvas.stage').click({ position: { x: vw - 20, y: 120 } }); await page.waitForTimeout(300); // close the dock
  const clips0 = await page.evaluate(() => globalThis.__fm?.clips ?? 0);
  const box = await page.getByRole('button', { name: 'take photo' }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  if (out) writeFileSync(`${out}/page-recording.png`, await page.screenshot());
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const clips = (await page.evaluate(() => globalThis.__fm?.clips ?? 0)) - clips0;
  console.log('hold to record: saved clips', clips, clips === 1 ? 'OK' : 'FAIL');
  await click('gallery');
  const badge = await page.locator('.thumb .badge').count();
  console.log('gallery shows a video badge:', badge >= 1 ? 'OK' : 'FAIL');
  await page.locator('.thumb').first().click(); await page.waitForTimeout(800);
  const playing = await page.evaluate(() => { const v = document.querySelector('video.full'); return v ? { w: v.videoWidth, h: v.videoHeight, err: v.error?.code ?? 0 } : null; });
  console.log('viewer video:', JSON.stringify(playing), playing && playing.w > 0 && playing.err === 0 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/page-video.png`, await page.screenshot());
  const dl0 = downloads.length;
  await click('Save'); await page.waitForTimeout(1500);
  if (downloads.length === dl0 + 1) {
    const path = await downloads[dl0].path();
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', path]).toString();
    const info = JSON.parse(probe);
    const kinds = info.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(' ');
    const v = info.streams.find((s) => s.codec_type === 'video');
    const stage = await page.evaluate(() => { const r = document.querySelector('canvas.stage').getBoundingClientRect(); return r.width / r.height; });
    console.log('clip file:', downloads[dl0].suggestedFilename(), statSync(path).size, 'bytes,', kinds, 'duration', info.format?.duration ?? 'n/a');
    console.log('clip has video and audio:', /video:/.test(kinds) && /audio:/.test(kinds) ? 'OK' : 'FAIL');
    console.log('clip aspect', (v.width / v.height).toFixed(3), 'screen', stage.toFixed(3), Math.abs(v.width / v.height - stage) < 0.03 ? 'OK' : 'FAIL');
  } else console.log('viewer save downloads the clip: FAIL');
  await closeSheet(); await closeSheet();
}
```

- [ ] **Step 2: Run the smoke against the production preview**

Run (two shells, or the preview in the background):

```bash
npm run build && npx vite preview --port 4173 --strictPort
SMOKE_OUT=<scratch dir> SMOKE_RECORD=1 SMOKE_GALLERY=1 SMOKE_VIEWPORT=380x860 SMOKE_SHOTS="warp,shout" FACE=test/face.jpg SMOKE_WAIT_MS=20000 node scripts/smoke.mjs http://localhost:4173
```

Expected: every line that ends in a verdict says `OK`; `hold to record: saved clips 1 OK`; `clip has video and audio: OK`; `--- third-party requests: none`. Headless Chromium has no H.264 encoder, so `recorder types` shows mp4 false and the clip is `.webm`: that exercises the fallback. View `page-recording.png` (red shutter with ring, no dock, no gear), `page-voice.png` (voice strip and mirror button), `page-video.png` (video in the viewer, no Edit button).

- [ ] **Step 3: Update the docs**

- `README.md`: in the smoke line add `SMOKE_RECORD=1`; add one sentence: "Hold the big button to record a video with a changed voice; videos live in the gallery next to the photos."
- `CLAUDE.md`: State section: add M3 to the shipped list and set the date; Commands: add `SMOKE_RECORD=1` to the smoke comment; "Next" line: M4.
- `docs/SPEC.md`: no change unless a ruling during execution changed behaviour; then record it under M3 with the date.
- `TODO.md`: check the M3 line in "Handoff 2026-09-26 late"; check the two tutorial and hold-to-record items (lines "First-launch tutorial" stays, "Tutorial step for M3" gets `[x]`).

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke.mjs README.md CLAUDE.md TODO.md docs/SPEC.md
git commit -m "test: smoke check for hold to record; docs for M3"
```

---

## Execution notes

- Order: Tasks 1 to 4 have no dependency on each other except Task 2 on Task 1. Tasks 1 + 2 and Tasks 3 + 4 run as two parallel worktree subagents from the plan commit. Tasks 5 to 8 are integration and run in the main session after both are cherry-picked.
- Phone checks the operator owes after merge (headless Chromium cannot answer them): mp4 with AAC on the Fold (`isTypeSupported`), voice quality of chipmunk, deep and monster (flutter), mic prompt on the first hold, clip plays in Viber or WhatsApp after share, recording at the phone's real camera resolution (the 2018 Android bug stopped 1280x720 canvas recording silently).
