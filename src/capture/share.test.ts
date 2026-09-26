import { describe, it, expect, vi } from 'vitest';
import { canShareFile, shareOrDownload } from './share';

const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' });

function fakeDoc() {
  const clicks: string[] = [];
  const a = { href: '', download: '', click: () => clicks.push(a.download), remove: () => {} };
  const doc = { createElement: () => a, body: { appendChild: () => {} } } as unknown as Document;
  return { doc, clicks };
}

describe('share', () => {
  it('canShareFile is false without navigator.share', () => {
    expect(canShareFile(file, {} as Navigator)).toBe(false);
  });

  it('downloads when share is unavailable', async () => {
    const { doc, clicks } = fakeDoc();
    (globalThis as any).URL.createObjectURL ??= () => 'blob:x';
    (globalThis as any).URL.revokeObjectURL ??= () => {};
    const out = await shareOrDownload(file, {} as Navigator, doc);
    expect(out).toBe('downloaded');
    expect(clicks).toEqual(['x.jpg']);
  });

  it('shares when canShare says yes', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { canShare: () => true, share } as unknown as Navigator;
    const out = await shareOrDownload(file, nav, fakeDoc().doc);
    expect(out).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Facemaker' });
  });

  it('reports cancelled on AbortError without downloading', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(err) } as unknown as Navigator;
    const { doc, clicks } = fakeDoc();
    expect(await shareOrDownload(file, nav, doc)).toBe('cancelled');
    expect(clicks).toEqual([]);
  });

  it('falls back to download on other share errors', async () => {
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as Navigator;
    const { doc, clicks } = fakeDoc();
    expect(await shareOrDownload(file, nav, doc)).toBe('downloaded');
    expect(clicks).toEqual(['x.jpg']);
  });
});
