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
    const ramp = ctx.createBuffer(1, sr, sr); ramp.copyToChannel(rampTable(sr) as Float32Array<ArrayBuffer>, 0);
    const fade = ctx.createBuffer(1, sr, sr); fade.copyToChannel(fadeTable(sr) as Float32Array<ArrayBuffer>, 0);
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
