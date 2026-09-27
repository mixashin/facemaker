import { describe, it, expect } from 'vitest';
import { Health, preferFrom, firstStart, fellMark, ERRORS_TO_RESTART, RESTART_GAP_MS, MAX_RESTARTS, GOOD_RESULTS, FELL_DAYS } from './health';

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
    expect(preferFrom('?u=1790000000000', 'CPU')).toEqual({ prefer: 'CPU', keep: undefined }); // the address after the update button
  });
  it('auto in the address takes the kept word away', () => {
    expect(preferFrom('?tracker=auto', 'CPU')).toEqual({ prefer: 'auto', keep: null });
  });
  it('a word that is not known changes nothing', () => {
    expect(preferFrom('?tracker=fast', 'CPU')).toEqual({ prefer: 'CPU', keep: undefined });
    expect(preferFrom('', 'nonsense')).toEqual({ prefer: 'auto', keep: undefined });
  });
});

// Errors in a row, as a graph of MediaPipe gives them after its first error: one per frame
const errors = (h: Health, n: number, at: number) => Array.from({ length: n }, (_, i) => h.error('graph has errors', at + i * 16));

describe('Health', () => {
  it('counts results, results with a face, and errors', () => {
    const h = new Health('auto');
    h.loaded(); h.ready('GPU');
    h.result(0); h.result(1); h.result(2);
    h.error('boom', 0);
    expect(h).toMatchObject({ files: true, delegate: 'GPU', results: 3, withFace: 2, errors: 1, lastError: 'boom', restarts: 0 });
  });

  it('errors in a row on the GPU: a new start on the CPU', () => {
    const h = new Health('auto');
    h.ready('GPU');
    const asked = errors(h, ERRORS_TO_RESTART + 3, 1000);
    expect(asked.slice(0, ERRORS_TO_RESTART - 1).every((a) => a === 'none')).toBe(true);
    expect(asked[ERRORS_TO_RESTART - 1]).toBe('cpu');
    expect(asked.slice(ERRORS_TO_RESTART).every((a) => a === 'none')).toBe(true); // the new start is on its way
    expect(h.restarts).toBe(1);
  });

  it('a graph that fails on the CPU too gets a new start again: a graph with an error stays broken', () => {
    const h = new Health('auto');
    h.ready('GPU');
    errors(h, ERRORS_TO_RESTART, 1000);
    h.ready('CPU');
    h.result(1); h.result(1);
    expect(errors(h, ERRORS_TO_RESTART, 1000 + RESTART_GAP_MS + 1).at(-1)).toBe('again');
    expect(h.restarts).toBe(2);
  });

  it('waits between two starts', () => {
    const h = new Health('auto');
    h.ready('GPU');
    errors(h, ERRORS_TO_RESTART, 1000);
    h.ready('CPU');
    expect(errors(h, ERRORS_TO_RESTART, 1200).every((a) => a === 'none')).toBe(true); // too soon
    expect(h.error('x', 1000 + 16 * ERRORS_TO_RESTART + RESTART_GAP_MS)).toBe('again'); // the first start was at 1000 + 16 * 4
  });

  it('a result between the errors starts the count again', () => {
    const h = new Health('auto');
    h.ready('GPU');
    expect(errors(h, ERRORS_TO_RESTART - 1, 0).every((a) => a === 'none')).toBe(true);
    h.result(1);
    expect(errors(h, ERRORS_TO_RESTART - 1, 100).every((a) => a === 'none')).toBe(true);
  });

  it('gives up after some starts, and takes heart again after a good while', () => {
    const h = new Health('CPU');
    h.ready('CPU');
    let t = 0;
    const starts: string[] = [];
    for (let i = 0; i < MAX_RESTARTS + 3; i++) { t += RESTART_GAP_MS + 1; starts.push(errors(h, ERRORS_TO_RESTART, t).at(-1)!); h.ready('CPU'); }
    expect(starts.filter((a) => a === 'again')).toHaveLength(MAX_RESTARTS);
    expect(starts.slice(MAX_RESTARTS).every((a) => a === 'none')).toBe(true);
    for (let i = 0; i < GOOD_RESULTS; i++) h.result(1);
    t += RESTART_GAP_MS + 1;
    expect(errors(h, ERRORS_TO_RESTART, t).at(-1)).toBe('again');
  });

  it('a forced tracker never changes: its new start is on the same one', () => {
    const h = new Health('GPU');
    h.ready('GPU');
    expect(errors(h, ERRORS_TO_RESTART, 0).at(-1)).toBe('again');
    const dead = new Health('GPU');
    expect(dead.failed('no start', 0)).toBe('again');
  });

  it('a tracker that does not start, or a worker that dies: the CPU the first time, then the same again', () => {
    const h = new Health('auto');
    expect(h.failed('worker: did not load', 0)).toBe('cpu');
    expect(h.failed('worker: did not load', 100)).toBe('none'); // too soon
    expect(h.failed('worker: did not load', RESTART_GAP_MS + 1)).toBe('again');
    expect(h.lastError).toBe('worker: did not load');
  });

  it('keeps the note of the start and keeps a long error short', () => {
    const h = new Health('auto');
    h.ready('CPU', 'GPU failed: no context');
    expect(h.note).toBe('GPU failed: no context');
    h.error('x'.repeat(2000), 0);
    expect(h.lastError.length).toBeLessThanOrEqual(300);
  });

  it('keeps the first error of a row: it names the cause, the next ones only say that the graph is broken', () => {
    const h = new Health('auto');
    h.ready('GPU');
    h.error('RET_CHECK failure: scale is too small', 0);
    h.error('Graph has errors', 16);
    h.error('Graph has errors', 32);
    expect(h.firstError).toBe('RET_CHECK failure: scale is too small');
    expect(h.lastError).toBe('Graph has errors');
    h.result(1);
    h.error('another cause', 100);
    expect(h.firstError).toBe('another cause');
  });
});

describe('firstStart', () => {
  const chrome154 = 'Mozilla/5.0 (Linux; Android 10; K) Chrome/154.0.0.0 Mobile', chrome155 = 'Mozilla/5.0 (Linux; Android 10; K) Chrome/155.0.0.0 Mobile';
  const DAY = 24 * 3600 * 1000, then = 1790000000000, mark = fellMark(chrome154, then);
  it('is what was asked for when nothing is kept', () => {
    expect(firstStart('auto', null, chrome154, then)).toBe('auto');
    expect(firstStart('GPU', null, chrome154, then)).toBe('GPU');
  });
  it('is the CPU at once when the GPU failed on this browser before', () => {
    expect(firstStart('auto', mark, chrome154, then + 1000)).toBe('CPU');
    expect(firstStart('auto', mark, chrome154, then + (FELL_DAYS - 1) * DAY)).toBe('CPU');
  });
  it('gives the GPU a new try on a new version of the browser', () => {
    expect(firstStart('auto', mark, chrome155, then + 1000)).toBe('auto');
  });
  it('gives the GPU a new try after some days: a failure that was not the fault of the GPU must not hold for ever', () => {
    expect(firstStart('auto', mark, chrome154, then + FELL_DAYS * DAY + 1)).toBe('auto');
  });
  it('a mark with no date, or with a date that is no number or lies ahead, is no mark', () => {
    expect(firstStart('auto', chrome154, chrome154, then)).toBe('auto'); // as the first version wrote it
    expect(firstStart('auto', 'soon ' + chrome154, chrome154, then)).toBe('auto');
    expect(firstStart('auto', '', chrome154, then)).toBe('auto');
    expect(firstStart('auto', fellMark(chrome154, then + 2 * DAY), chrome154, then)).toBe('auto'); // the clock of the device went back
  });
  it('a forced tracker stays', () => {
    expect(firstStart('GPU', mark, chrome154, then + 1000)).toBe('GPU');
    expect(firstStart('CPU', null, chrome154, then)).toBe('CPU');
  });
});

describe('Health: a start that has to wait', () => {
  it('says how long: the rest of the wait between two starts', () => {
    const h = new Health('auto');
    expect(h.wait(0)).toBe(0); // no start before: at once
    expect(h.failed('no model', 1000)).toBe('cpu');
    expect(h.wait(1000)).toBe(RESTART_GAP_MS);
    expect(h.wait(4000)).toBe(RESTART_GAP_MS - 3000);
    expect(h.wait(1000 + RESTART_GAP_MS + 50)).toBe(0);
  });
  it('the start after the wait is a start with no new error', () => {
    const h = new Health('auto');
    h.failed('no model', 0);
    expect(h.failed('no model', 1000)).toBe('none'); // too soon
    const errors = h.errors;
    expect(h.retry(1000)).toBe('none'); // still too soon
    expect(h.retry(RESTART_GAP_MS)).toBe('again');
    expect(h.errors).toBe(errors);
    expect(h.restarts).toBe(2);
  });
  it('says null when no start is left', () => {
    const h = new Health('auto');
    for (let i = 0; i < MAX_RESTARTS; i++) expect(h.failed('dead', i * RESTART_GAP_MS)).not.toBe('none');
    expect(h.failed('dead', MAX_RESTARTS * RESTART_GAP_MS)).toBe('none');
    expect(h.wait(MAX_RESTARTS * RESTART_GAP_MS)).toBeNull();
  });
});
