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
