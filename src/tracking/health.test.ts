import { describe, it, expect } from 'vitest';
import { Health, preferFrom, ERRORS_TO_FALL_BACK } from './health';

describe('preferFrom', () => {
  it('is auto with no word in the address and nothing kept', () => {
    expect(preferFrom('', null)).toEqual({ prefer: 'auto', keep: undefined });
    expect(preferFrom('?lang=sr', null)).toEqual({ prefer: 'auto', keep: undefined });
  });
  it('takes the word in the address and keeps it on the device', () => {
    expect(preferFrom('?tracker=cpu', null)).toEqual({ prefer: 'CPU', keep: 'CPU' });
    expect(preferFrom('?x=1&tracker=GPU', 'CPU')).toEqual({ prefer: 'GPU', keep: 'GPU' });
  });
  it('uses what is kept when the address says nothing', () => {
    expect(preferFrom('', 'CPU')).toEqual({ prefer: 'CPU', keep: undefined });
  });
  it('auto in the address takes the kept word away', () => {
    expect(preferFrom('?tracker=auto', 'CPU')).toEqual({ prefer: 'auto', keep: null });
  });
  it('a word that is not known changes nothing', () => {
    expect(preferFrom('?tracker=fast', 'CPU')).toEqual({ prefer: 'CPU', keep: undefined });
    expect(preferFrom('', 'nonsense')).toEqual({ prefer: 'auto', keep: undefined });
  });
});

describe('Health', () => {
  it('counts results, results with a face, and errors', () => {
    const h = new Health('auto');
    h.ready('GPU');
    h.result(0); h.result(1); h.result(2);
    h.error('boom');
    expect(h).toMatchObject({ delegate: 'GPU', results: 3, withFace: 2, errors: 1, lastError: 'boom' });
  });
  it('asks for the CPU after errors in a row on the GPU, one time only', () => {
    const h = new Health('auto');
    h.ready('GPU');
    const asked = Array.from({ length: ERRORS_TO_FALL_BACK + 3 }, () => h.error('gl lost'));
    expect(asked.filter(Boolean)).toHaveLength(1);
    expect(asked[ERRORS_TO_FALL_BACK - 1]).toBe(true);
  });
  it('a result between the errors starts the count again', () => {
    const h = new Health('auto');
    h.ready('GPU');
    for (let i = 0; i < ERRORS_TO_FALL_BACK - 1; i++) expect(h.error('x')).toBe(false);
    h.result(1);
    for (let i = 0; i < ERRORS_TO_FALL_BACK - 1; i++) expect(h.error('x')).toBe(false);
  });
  it('asks for the CPU when the tracker does not start on the GPU at all', () => {
    const h = new Health('auto');
    expect(h.error('worker did not load')).toBe(false); // one error before the start can be a slow network
    expect(h.failed('no start in 20 s')).toBe(true);
    expect(h.failed('no start in 20 s')).toBe(false); // one time only
    expect(h.lastError).toBe('no start in 20 s');
  });
  it('never leaves a tracker that the operator forced, and never leaves the CPU', () => {
    const forced = new Health('GPU');
    forced.ready('GPU');
    for (let i = 0; i < 20; i++) expect(forced.error('x')).toBe(false);
    expect(forced.failed('no start')).toBe(false);
    const cpu = new Health('auto');
    cpu.ready('CPU', 'GPU failed: no context');
    for (let i = 0; i < 20; i++) expect(cpu.error('x')).toBe(false);
    expect(cpu.note).toBe('GPU failed: no context');
  });
  it('keeps a long error short', () => {
    const h = new Health('auto');
    h.error('x'.repeat(2000));
    expect(h.lastError.length).toBeLessThanOrEqual(300);
  });
});
