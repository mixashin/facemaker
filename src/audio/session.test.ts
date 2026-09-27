import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVoiceSession, IDLE_MS } from './session';
import type { VoiceId } from './voice';

type FakeEngine = { mic: unknown; preset: VoiceId; disposed: boolean; resumed: number; setPreset(p: VoiceId): void; resume(): Promise<void>; dispose(): void; level(): number; stream: MediaStream };

function setup(opts: { throwOnMake?: boolean; hidden?: () => boolean } = {}) {
  const log: string[] = [];
  const engines: FakeEngine[] = [];
  let mic: unknown = { id: 'mic1' };
  const s = createVoiceSession({
    getMic: async () => mic as MediaStream | null,
    releaseMic: () => { log.push('releaseMic'); },
    hidden: opts.hidden,
    makeEngine: (m, id) => {
      if (opts.throwOnMake) throw new Error('no audio device');
      const e: FakeEngine = {
        mic: m, preset: id, disposed: false, resumed: 0,
        setPreset(p) { this.preset = p; },
        resume: async function (this: FakeEngine) { this.resumed++; },
        dispose() { this.disposed = true; log.push('dispose'); },
        level: () => 0,
        stream: {} as MediaStream,
      };
      engines.push(e);
      return e;
    },
  });
  return { s, log, engines, setMic: (m: unknown) => { mic = m; } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('voice session', () => {
  it('opens the mic and the engine for the first user', async () => {
    const t = setup();
    const lease = await t.s.acquire('robot');
    expect(lease.engine).toBe(t.engines[0]);
    expect(t.engines[0].preset).toBe('robot');
    expect(t.engines[0].resumed).toBe(1);
    expect(t.s.current()).toBe(t.engines[0]);
  });

  it('turns the mic off a few seconds after the last user let go, not before', async () => {
    const t = setup();
    const lease = await t.s.acquire('none');
    lease.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(t.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.log).toEqual(['dispose', 'releaseMic']);
    expect(t.s.current()).toBeNull();
  });

  it('no mic in the background: the last user lets go while the page is hidden, and the mic goes off at once', async () => {
    const t = setup({ hidden: () => true });
    const lease = await t.s.acquire('none');
    lease.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.log).toEqual(['dispose', 'releaseMic']);
    expect(t.s.current()).toBeNull();
  });
  it('no mic in the background: the page hides inside the idle time, and the mic goes off at once', async () => {
    const t = setup();
    const lease = await t.s.acquire('none');
    lease.release();
    await vi.advanceTimersByTimeAsync(1000);
    t.s.rest();
    expect(t.log).toEqual(['dispose', 'releaseMic']);
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['dispose', 'releaseMic']); // one time
  });
  it('the page hides while a user holds the mic: the user decides (a clip that ends saves its sound first)', async () => {
    const t = setup();
    const lease = await t.s.acquire('none');
    t.s.rest();
    expect(t.log).toEqual([]);
    expect(t.s.current()).not.toBeNull();
    lease.release();
  });
  it('the page hides after an audio engine that failed: the mic goes off at once', async () => {
    const t = setup({ throwOnMake: true });
    const lease = await t.s.acquire('none');
    expect(lease.engine).toBeNull();
    expect(t.log).toEqual([]); // the mic answered, it is on until the idle time ends
    t.s.rest();
    expect(t.log).toEqual(['releaseMic']);
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['releaseMic']);
  });
  it('the page hides with no mic in use: nothing to do', async () => {
    const t = setup();
    t.s.rest();
    expect(t.log).toEqual([]);
  });
  it('keeps the mic while any user holds it', async () => {
    const t = setup();
    const rec = await t.s.acquire('none');
    const shout = await t.s.acquire('none');
    rec.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS * 3);
    expect(t.log).toEqual([]);
    shout.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['dispose', 'releaseMic']);
  });

  it('a new user inside the idle window keeps the same engine and sets its voice', async () => {
    const t = setup();
    (await t.s.acquire('none')).release();
    await vi.advanceTimersByTimeAsync(IDLE_MS - 500);
    const lease = await t.s.acquire('chipmunk');
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(t.engines).toHaveLength(1);
    expect(lease.engine).toBe(t.engines[0]);
    expect(t.engines[0].preset).toBe('chipmunk');
    expect(t.log).toEqual([]);
  });

  it('releasing a lease twice counts once', async () => {
    const t = setup();
    const a = await t.s.acquire('none');
    const b = await t.s.acquire('none');
    a.release(); a.release(); a.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(t.log).toEqual([]); // b still holds the mic
    b.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['dispose', 'releaseMic']);
  });

  it('a refused mic gives a lease without an engine and holds nothing', async () => {
    const t = setup();
    t.setMic(null);
    const lease = await t.s.acquire('robot');
    expect(lease.engine).toBeNull();
    expect(t.engines).toHaveLength(0);
    expect(() => lease.release()).not.toThrow();
    t.setMic({ id: 'mic1' });
    const ok = await t.s.acquire('robot');
    ok.release();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['dispose', 'releaseMic']); // the refused lease left no count behind
  });

  it('an audio engine that cannot start gives a lease without an engine, never a rejection, and frees the mic', async () => {
    const t = setup({ throwOnMake: true });
    const lease = await t.s.acquire('robot');
    expect(lease.engine).toBeNull();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['releaseMic']);
  });

  it('rebuilds the engine when the mic stream changed (the old one died)', async () => {
    const t = setup();
    const a = await t.s.acquire('deep');
    t.setMic({ id: 'mic2' });
    const b = await t.s.acquire('deep');
    expect(t.engines).toHaveLength(2);
    expect(t.engines[0].disposed).toBe(true);
    expect(b.engine).toBe(t.engines[1]);
    expect(t.engines[1].mic).toEqual({ id: 'mic2' });
    a.release(); b.release();
  });

  it('setPreset changes the voice of a running engine and is a no-op without one', async () => {
    const t = setup();
    expect(() => t.s.setPreset('echo')).not.toThrow();
    const lease = await t.s.acquire('none');
    t.s.setPreset('echo');
    expect(t.engines[0].preset).toBe('echo');
    lease.release();
  });

  it('a release that comes before the mic answer still ends with the mic off', async () => {
    const t = setup();
    const pending = t.s.acquire('none');
    pending.then((l) => l.release()); // the consumer let go while the prompt was open
    await pending;
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(t.log).toEqual(['dispose', 'releaseMic']);
  });
});
