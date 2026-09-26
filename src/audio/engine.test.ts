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
