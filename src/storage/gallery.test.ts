import { describe, it, expect } from 'vitest';
import { parseName, mimeForName, MemoryStore, safePut } from './gallery';

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

describe('MemoryStore zero-byte files', () => {
  it('skips zero-byte files left by a failed write', async () => {
    const s = new MemoryStore();
    await s.put('facemaker-2026-09-26T10-00-00-000Z.jpg', blob(0));
    await s.put('facemaker-2026-09-26T11-00-00-000Z.jpg', blob(5));
    expect((await s.list()).map((i) => i.name)).toEqual(['facemaker-2026-09-26T11-00-00-000Z.jpg']);
  });
});

describe('safePut', () => {
  it('removes the ghost file when the write fails', async () => {
    const deleted: string[] = [];
    const bad = { put: async () => { throw new Error('full'); }, delete: async (n: string) => { deleted.push(n); } } as unknown as MemoryStore;
    expect(await safePut(bad, 'facemaker-2026-09-26T10-00-00-000Z.jpg', blob(1))).toBe(false);
    expect(deleted).toEqual(['facemaker-2026-09-26T10-00-00-000Z.jpg']);
  });

  it('returns true on success and false when the store throws', async () => {
    const ok = new MemoryStore();
    expect(await safePut(ok, 'facemaker-2026-09-26T10-00-00-000Z.jpg', blob(1))).toBe(true);
    const bad = { put: async () => { throw new DOMException('full', 'QuotaExceededError'); } } as unknown as MemoryStore;
    expect(await safePut(bad, 'facemaker-2026-09-26T10-00-00-000Z.jpg', blob(1))).toBe(false);
  });
});

describe('video support', () => {
  it('knows the mime type from the file name, because OPFS files carry none', () => {
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.jpg')).toBe('image/jpeg');
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.mp4')).toBe('video/mp4');
    expect(mimeForName('facemaker-2026-09-27T10-20-30-456Z.webm')).toBe('video/webm');
    expect(mimeForName('notes.txt')).toBe('application/octet-stream');
  });

  it('hands the file name to the thumbnail maker, so a video gets a frame grab', async () => {
    const seen: string[] = [];
    const s = new MemoryStore(async (b, name) => { seen.push(name); return b; });
    await s.put('facemaker-2026-09-27T10-20-30-456Z.mp4', blob(30));
    await s.thumb('facemaker-2026-09-27T10-20-30-456Z.mp4');
    await s.thumb('facemaker-2026-09-27T10-20-30-456Z.mp4'); // cached
    expect(seen).toEqual(['facemaker-2026-09-27T10-20-30-456Z.mp4']);
  });

  it('lists a saved video as a video', async () => {
    const s = new MemoryStore();
    await s.put('facemaker-2026-09-27T10-20-30-456Z.webm', blob(30));
    expect((await s.list())[0].type).toBe('video');
  });
});
