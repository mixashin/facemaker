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
