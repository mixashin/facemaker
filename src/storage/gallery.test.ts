import { describe, it, expect } from 'vitest';
import { parseName, MemoryStore, safePut } from './gallery';

const blob = (n: number) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' });

describe('parseName', () => {
  it('reads type and created time from a snapshot file name', () => {
    const it1 = parseName('facemaker-2026-09-26T19-45-34-268Z.jpg');
    expect(it1?.type).toBe('image');
    expect(it1?.created).toBe(Date.UTC(2026, 8, 26, 19, 45, 34, 268));
    expect(parseName('facemaker-2026-09-26T19-45-34-268Z.mp4')?.type).toBe('video');
  });

  it('returns null for foreign or partial names', () => {
    expect(parseName('photo.jpg')).toBeNull();
    expect(parseName('facemaker-2026-09-26T19-45-34-268Z.jpg.crswap')).toBeNull();
    expect(parseName('facemaker-2026-09-26T19-45-34-268Z.json')).toBeNull();
    expect(parseName('')).toBeNull();
  });
});

describe('MemoryStore', () => {
  it('lists newest first with sizes and skips foreign names', async () => {
    const s = new MemoryStore();
    await s.put('facemaker-2026-09-26T10-00-00-000Z.jpg', blob(10));
    await s.put('facemaker-2026-09-26T12-00-00-000Z.jpg', blob(20));
    await s.put('notes.txt', blob(5));
    const l = await s.list();
    expect(l.map((i) => i.name)).toEqual(['facemaker-2026-09-26T12-00-00-000Z.jpg', 'facemaker-2026-09-26T10-00-00-000Z.jpg']);
    expect(l[0].size).toBe(20);
  });

  it('gets, deletes, clears and reports usage', async () => {
    const s = new MemoryStore();
    await s.put('facemaker-2026-09-26T10-00-00-000Z.jpg', blob(10));
    expect((await s.get('facemaker-2026-09-26T10-00-00-000Z.jpg'))?.size).toBe(10);
    expect(await s.get('missing.jpg')).toBeNull();
    expect((await s.usage()).used).toBe(10);
    await s.delete('facemaker-2026-09-26T10-00-00-000Z.jpg');
    expect(await s.list()).toEqual([]);
    await s.put('facemaker-2026-09-26T10-00-00-000Z.jpg', blob(10));
    await s.clear();
    expect(await s.list()).toEqual([]);
    expect((await s.usage()).used).toBe(0);
  });

  it('caches thumbnails through the injected maker', async () => {
    let calls = 0;
    const s = new MemoryStore(async (b) => { calls++; return b; });
    await s.put('facemaker-2026-09-26T10-00-00-000Z.jpg', blob(10));
    await s.thumb('facemaker-2026-09-26T10-00-00-000Z.jpg');
    await s.thumb('facemaker-2026-09-26T10-00-00-000Z.jpg');
    expect(calls).toBe(1);
    expect(await s.thumb('missing.jpg')).toBeNull();
  });
});

describe('safePut', () => {
  it('returns true on success and false when the store throws', async () => {
    const ok = new MemoryStore();
    expect(await safePut(ok, 'facemaker-2026-09-26T10-00-00-000Z.jpg', blob(1))).toBe(true);
    const bad = { put: async () => { throw new DOMException('full', 'QuotaExceededError'); } } as unknown as MemoryStore;
    expect(await safePut(bad, 'facemaker-2026-09-26T10-00-00-000Z.jpg', blob(1))).toBe(false);
  });
});
