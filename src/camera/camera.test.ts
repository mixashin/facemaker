import { describe, it, expect } from 'vitest';
import { cameraLost, startCamera, stopCamera, startOnReturn, retryIn, RETRY_MS } from './camera';

const stream = (...states: string[]) => ({ getVideoTracks: () => states.map((readyState) => ({ readyState })) }) as unknown as MediaStream;

describe('cameraLost', () => {
  it('is true without a stream and without a video track', () => {
    expect(cameraLost(null)).toBe(true);
    expect(cameraLost(stream())).toBe(true);
  });
  it('is true when the track ended (another app took the camera)', () => {
    expect(cameraLost(stream('ended'))).toBe(true);
  });
  it('is false while the track is live', () => {
    expect(cameraLost(stream('live'))).toBe(false);
  });
});

// A camera stream with one track that knows if somebody stopped it
const cam = () => {
  const t = { readyState: 'live', stop() { t.readyState = 'ended'; } };
  return { getTracks: () => [t], getVideoTracks: () => [t], track: t } as unknown as MediaStream & { track: { readyState: string } };
};
type Ask = { resolve: (s: MediaStream) => void; reject: (e: unknown) => void };
// The device answers when the test says so
const devices = () => {
  const asks: Ask[] = [];
  return { asks, getUserMedia: () => new Promise<MediaStream>((resolve, reject) => asks.push({ resolve, reject })) };
};
const screenOf = (play: () => Promise<void> = async () => {}) =>
  ({ srcObject: null, muted: false, playsInline: false, videoWidth: 640, play, addEventListener() {} }) as unknown as HTMLVideoElement;
const page = (hidden = false) => ({ hidden });
const tick = () => new Promise((r) => setTimeout(r, 0)); // all steps that are ready run before it ends
// A video element that has no picture size yet, with its events
const slowScreen = () => {
  const on = new Map<string, Set<() => void>>();
  const v = {
    srcObject: null as unknown, muted: false, playsInline: false, videoWidth: 0, play: async () => {},
    addEventListener(type: string, f: () => void, opts?: { signal?: AbortSignal }) {
      if (!on.has(type)) on.set(type, new Set());
      on.get(type)!.add(f);
      opts?.signal?.addEventListener('abort', () => on.get(type)!.delete(f));
    },
    fire(type: string) { [...(on.get(type) ?? [])].forEach((f) => f()); },
    listeners: () => [...on.values()].reduce((n, s) => n + s.size, 0),
  };
  return v as unknown as HTMLVideoElement & { fire(type: string): void; listeners(): number };
};

describe('startCamera', () => {
  it('gives the stream to the video', async () => {
    const v = screenOf(), d = devices(), s = cam();
    const p = startCamera(v, 'user', d, page());
    d.asks[0].resolve(s);
    expect(await p).toBe(s);
    expect(v.srcObject).toBe(s);
    expect(s.track.readyState).toBe('live');
  });
  it('does not ask for the camera while the page is hidden', async () => {
    const v = screenOf(), d = devices();
    expect(await startCamera(v, 'user', d, page(true))).toBe(null);
    expect(d.asks.length).toBe(0);
  });
  it('stops a stream that arrives after the page went to the background', async () => {
    const v = screenOf(), d = devices(), s = cam(), doc = page();
    const p = startCamera(v, 'user', d, doc);
    doc.hidden = true;
    d.asks[0].resolve(s);
    expect(await p).toBe(null);
    expect(s.track.readyState).toBe('ended');
    expect(v.srcObject).toBe(null);
  });
  it('stops the stream of an older start: the newest start has the camera', async () => {
    const v = screenOf(), d = devices(), old = cam(), fresh = cam();
    const a = startCamera(v, 'user', d, page());
    const b = startCamera(v, 'environment', d, page());
    d.asks[1].resolve(fresh);
    expect(await b).toBe(fresh);
    d.asks[0].resolve(old);
    expect(await a).toBe(null);
    expect(old.track.readyState).toBe('ended');
    expect(fresh.track.readyState).toBe('live');
    expect(v.srcObject).toBe(fresh);
  });
  it('gives the error of the device', async () => {
    const v = screenOf(), d = devices();
    const p = startCamera(v, 'user', d, page());
    d.asks[0].reject(new Error('no camera'));
    await expect(p).rejects.toThrow('no camera');
  });
  it('drops an error that comes while the page is hidden: the start on return decides', async () => {
    const v = screenOf(), d = devices(), doc = page();
    const p = startCamera(v, 'user', d, doc);
    doc.hidden = true;
    d.asks[0].reject(new Error('page in the background'));
    expect(await p).toBe(null);
  });
  it('drops the error of an older start', async () => {
    const v = screenOf(), d = devices(), fresh = cam();
    const a = startCamera(v, 'user', d, page());
    const b = startCamera(v, 'user', d, page());
    d.asks[0].reject(new Error('busy'));
    expect(await a).toBe(null);
    d.asks[1].resolve(fresh);
    expect(await b).toBe(fresh);
  });
  it('gives no error when the camera was stopped while the video started to play', async () => {
    let fail = (_e: unknown) => {};
    const v = screenOf(() => new Promise<void>((_ok, no) => { fail = no; })), d = devices(), s = cam();
    const p = startCamera(v, 'user', d, page());
    d.asks[0].resolve(s);
    await tick();
    expect(v.srcObject).toBe(s);
    stopCamera(v); // the page went to the background
    fail(new Error('The play() request was interrupted'));
    expect(await p).toBe(null);
    expect(s.track.readyState).toBe('ended');
  });
  it('a new start stops the camera that runs, at once', async () => {
    const v = screenOf(), d = devices(), first = cam();
    const a = startCamera(v, 'user', d, page());
    d.asks[0].resolve(first);
    await a;
    startCamera(v, 'environment', d, page()); // a phone gives one camera at a time: the front one must be free
    expect(first.track.readyState).toBe('ended');
    expect(v.srcObject).toBe(null);
  });
  it('waits until the picture has a size', async () => {
    const v = slowScreen(), d = devices(), s = cam();
    let done = false;
    const p = startCamera(v, 'user', d, page()).then((r) => { done = true; return r; });
    d.asks[0].resolve(s);
    await tick();
    expect(done).toBe(false);
    v.fire('loadedmetadata');
    expect(await p).toBe(s);
    expect(v.listeners()).toBe(0); // no listener stays on the video
  });
  it('ends the wait for the size when the camera stops: the start gives nothing, and no listener stays', async () => {
    const v = slowScreen(), d = devices(), s = cam();
    const p = startCamera(v, 'user', d, page());
    d.asks[0].resolve(s);
    await tick();
    stopCamera(v); // the page went to the background
    v.fire('emptied'); // the video element says that it has no source any more
    expect(await Promise.race([p, tick().then(() => 'still waits')])).toBe(null);
    expect(v.listeners()).toBe(0);
  });
  it('gives the error of a video that does not play', async () => {
    const v = screenOf(async () => { throw new Error('no play'); }), d = devices();
    const p = startCamera(v, 'user', d, page());
    d.asks[0].resolve(cam());
    await expect(p).rejects.toThrow('no play');
  });
});

describe('startOnReturn', () => {
  it('starts the camera that the background took', () => {
    expect(startOnReturn('live', null)).toBe(true);
    expect(startOnReturn('live', stream('ended'))).toBe(true);
  });
  it('starts the camera that was on its way when the page went to the background', () => {
    expect(startOnReturn('starting', null)).toBe(true);
  });
  it('leaves a camera that works', () => {
    expect(startOnReturn('live', stream('live'))).toBe(false);
  });
  it('tries again after an error that can go away: the camera was busy, the phone was locked', () => {
    expect(startOnReturn('error', null)).toBe(true);
  });
  it('leaves the screens that a new try does not cure: no permission, no camera', () => {
    for (const s of ['idle', 'denied', 'nocam'] as const) expect(startOnReturn(s, null)).toBe(false);
  });
});

describe('retryIn', () => {
  it('a camera that is busy gets two more tries before the error screen', () => {
    expect(retryIn('error', 0)).toBe(RETRY_MS[0]);
    expect(retryIn('error', 1)).toBe(RETRY_MS[1]);
    expect(retryIn('error', 2)).toBe(null);
    expect(RETRY_MS).toHaveLength(2);
    expect(RETRY_MS[0] + RETRY_MS[1]).toBeLessThanOrEqual(3000); // the child does not wait long for the error screen
  });
  it('no new try when a try does not help: no permission, no camera', () => {
    expect(retryIn('denied', 0)).toBe(null);
    expect(retryIn('nocam', 0)).toBe(null);
  });
});
