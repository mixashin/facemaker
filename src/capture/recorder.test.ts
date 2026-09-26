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
