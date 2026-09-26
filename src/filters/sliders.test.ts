import { describe, it, expect } from 'vitest';
import { DEFAULT_SLIDERS, REGIONS, MODES, WOBBLE_PERIOD_MS, sliderHandles, type SliderState } from './sliders';
import type { Face } from '../tracking/faceTracker';

function face(): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5); set(10, 0.5, 0.2); set(152, 0.5, 0.8);
  set(13, 0.5, 0.62); set(14, 0.5, 0.64); set(4, 0.5, 0.5);
  for (let i = 468; i < 473; i++) set(i, 0.42, 0.45);
  for (let i = 473; i < 478; i++) set(i, 0.58, 0.45);
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}
const withRegion = (region: keyof SliderState, mode: SliderState[keyof SliderState]['mode'], amount: number): SliderState => ({ ...DEFAULT_SLIDERS, [region]: { mode, amount } });

describe('sliderHandles', () => {
  it('has seven regions and four modes with icons, all off by default', () => {
    expect(REGIONS).toHaveLength(7); expect(MODES).toHaveLength(4);
    for (const r of REGIONS) { expect(r.icon.length).toBeGreaterThan(0); expect(DEFAULT_SLIDERS[r.id].mode).toBe('off'); }
    expect(sliderHandles(DEFAULT_SLIDERS, [face()], 16 / 9, 0)).toEqual([]);
  });

  it('size gives a scale handle on the region, sign follows the amount', () => {
    const h = sliderHandles(withRegion('nose', 'size', -0.5), [face()], 16 / 9, 0);
    expect(h).toHaveLength(1);
    expect(h[0].type).toBe(0); expect(h[0].cx).toBeCloseTo(0.5, 4); expect(h[0].cy).toBeCloseTo(0.5, 4);
    expect(h[0].strength).toBeLessThan(0);
  });

  it('wobble is time based with a fixed period', () => {
    const s = withRegion('mouth', 'wobble', 1);
    const a = sliderHandles(s, [face()], 16 / 9, 300)[0].strength;
    const b = sliderHandles(s, [face()], 16 / 9, 300 + WOBBLE_PERIOD_MS)[0].strength;
    const c = sliderHandles(s, [face()], 16 / 9, 300 + WOBBLE_PERIOD_MS / 2)[0].strength;
    expect(a).toBeCloseTo(b, 6);
    expect(c).toBeCloseTo(-a, 6);
    expect(Math.abs(a)).toBeGreaterThan(0);
  });

  it('swirl gives a type 1 handle, ears give two handles, two faces double everything', () => {
    expect(sliderHandles(withRegion('forehead', 'swirl', 0.5), [face()], 16 / 9, 0)[0].type).toBe(1);
    expect(sliderHandles(withRegion('ears', 'size', 0.5), [face()], 16 / 9, 0)).toHaveLength(2);
    expect(sliderHandles(withRegion('ears', 'size', 0.5), [face(), face()], 16 / 9, 0)).toHaveLength(4);
  });
});
