import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMic, releaseMic, micNeedsPrompt, micState, MIC_CONSTRAINTS, type MicState } from './mic';

function fakeStream(id = 'mic') {
  const track = { readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } };
  return { id, track, getAudioTracks: () => [track], getTracks: () => [track] };
}
type Fake = ReturnType<typeof fakeStream>;
const asStream = (f: Fake) => f as unknown as MediaStream;

function devices(next: () => Fake) {
  let calls = 0;
  return {
    calls: () => calls,
    getUserMedia: async (c: MediaStreamConstraints) => { calls++; expect(c).toEqual(MIC_CONSTRAINTS); return asStream(next()); },
  };
}
const refuse = { getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError'); } };

describe('getMic', () => {
  beforeEach(() => { releaseMic(); micState.value = 'idle'; });

  it('asks once for concurrent callers and keeps the stream', async () => {
    const s = fakeStream();
    const md = devices(() => s);
    const [a, b] = await Promise.all([getMic(md), getMic(md)]);
    expect(a).toBe(s);
    expect(b).toBe(s);
    expect(await getMic(md)).toBe(s);
    expect(md.calls()).toBe(1);
    expect(micState.value).toBe('live');
  });

  it('a refusal gives null and the denied state, without throwing', async () => {
    expect(await getMic(refuse)).toBeNull();
    expect(micState.value).toBe('denied');
  });

  it('asks again after a refusal, so a changed permission works without a reload', async () => {
    const s = fakeStream();
    expect(await getMic(refuse)).toBeNull();
    expect(await getMic(devices(() => s))).toBe(s);
    expect(micState.value).toBe('live');
  });

  it('a repeated refusal never leaves the denied state, so the lock hint does not flicker', async () => {
    await getMic(refuse);
    const seen: MicState[] = [];
    const stop = micState.subscribe((v) => seen.push(v));
    await getMic(refuse);
    stop();
    expect(new Set(seen)).toEqual(new Set(['denied']));
  });

  it('turns echo cancellation, noise suppression and auto gain on', () => {
    expect(MIC_CONSTRAINTS).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  });
});

describe('releaseMic', () => {
  beforeEach(() => { releaseMic(); micState.value = 'idle'; });

  it('stops every track, so the mic indicator of the browser goes off, and the next use asks again', async () => {
    const s1 = fakeStream('a'), s2 = fakeStream('b');
    const queue = [s1, s2];
    const md = devices(() => queue.shift()!);
    expect(await getMic(md)).toBe(s1);
    releaseMic();
    expect(s1.track.stopped).toBe(true);
    expect(micState.value).toBe('idle');
    expect(await getMic(md)).toBe(s2);
    expect(md.calls()).toBe(2);
    expect(s2.track.stopped).toBe(false);
  });

  it('keeps the denied state, so the lock hint stays', async () => {
    await getMic(refuse);
    releaseMic();
    expect(micState.value).toBe('denied');
  });

  it('is safe to call with no mic open', () => {
    expect(() => { releaseMic(); releaseMic(); }).not.toThrow();
    expect(micState.value).toBe('idle');
  });
});

describe('a dead microphone', () => {
  beforeEach(() => { releaseMic(); micState.value = 'idle'; });

  it('a cached stream whose track ended (unplugged, permission revoked) is dropped and the mic is asked again', async () => {
    const s1 = fakeStream('a'), s2 = fakeStream('b');
    const queue = [s1, s2];
    const md = devices(() => queue.shift()!);
    expect(await getMic(md)).toBe(s1);
    s1.track.readyState = 'ended';
    expect(await getMic(md)).toBe(s2);
    expect(md.calls()).toBe(2);
    expect(micState.value).toBe('live');
  });
});

describe('micNeedsPrompt', () => {
  beforeEach(() => { releaseMic(); micState.value = 'idle'; });
  const perms = (state: string) => ({ query: async (d: { name: string }) => { expect(d.name).toBe('microphone'); return { state }; } });

  it('an open question needs the prompt', async () => {
    expect(await micNeedsPrompt(perms('prompt'))).toBe(true);
    expect(micState.value).toBe('idle');
  });

  it('a granted mic needs nothing: opening the voice tab must not turn the mic on', async () => {
    expect(await micNeedsPrompt(perms('granted'))).toBe(false);
    expect(micState.value).toBe('idle');
  });

  it('a blocked mic needs no prompt and shows the lock hint', async () => {
    expect(await micNeedsPrompt(perms('denied'))).toBe(false);
    expect(micState.value).toBe('denied');
  });

  it('without the permissions API it asks once per session, then never again', async () => {
    vi.resetModules(); // a fresh session: no mic question asked yet
    const fresh = await import('./mic');
    const none = { query: async () => { throw new TypeError('not supported'); } };
    expect(await fresh.micNeedsPrompt(none)).toBe(true);
    expect(await fresh.micNeedsPrompt(undefined)).toBe(true);
    await fresh.getMic(devices(() => fakeStream()));
    expect(await fresh.micNeedsPrompt(none)).toBe(false);
    expect(await fresh.micNeedsPrompt(undefined)).toBe(false);
    fresh.releaseMic();
  });
});
