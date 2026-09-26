type Pausable = { pause(): void };
type Doc = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

// A video or a played-back voice must stop when the kid switches to another app (operator, 2026-09-27).
// It stays paused on return: a tap on play continues. Returns the cleanup.
export function pauseWhenHidden(getMedia: () => Pausable | null | undefined, doc: Doc = document): () => void {
  const onChange = () => { if (doc.hidden) getMedia()?.pause(); };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}
