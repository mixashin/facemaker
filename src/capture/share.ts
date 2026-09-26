export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canShareFile(file: File, nav: Navigator = navigator): boolean {
  return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

export function downloadFile(file: File, doc: Document = document): void {
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareOrDownload(file: File, nav: Navigator = navigator, doc: Document = document): Promise<ShareOutcome> {
  if (!canShareFile(file, nav)) { downloadFile(file, doc); return 'downloaded'; }
  try {
    await nav.share({ files: [file], title: 'Facemaker' });
    return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
    downloadFile(file, doc);
    return 'downloaded';
  }
}
