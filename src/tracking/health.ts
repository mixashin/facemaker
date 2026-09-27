// State of the face tracker, for the device report and for the way back to the CPU.
// Found 2026-09-27 on a phone: the place behind the person worked (CPU), the face was not tracked (GPU first),
// and the app showed nothing about it.
export type Prefer = 'auto' | 'GPU' | 'CPU';
export const PREFER_KEY = 'fm.tracker';
export const ERRORS_TO_FALL_BACK = 5;
export const START_LIMIT_MS = 20000;

const WORDS: Record<string, Prefer> = { cpu: 'CPU', gpu: 'GPU', auto: 'auto' };

// The address can force the tracker: ?tracker=cpu, ?tracker=gpu. The word is kept on the device. ?tracker=auto
// takes it away. keep: the value to store, null to remove it, undefined for no change.
export function preferFrom(search: string, stored: string | null): { prefer: Prefer; keep: Prefer | null | undefined } {
  const word = WORDS[(new URLSearchParams(search).get('tracker') ?? '').toLowerCase()];
  if (word === 'auto') return { prefer: 'auto', keep: null };
  if (word) return { prefer: word, keep: word };
  return { prefer: stored === 'CPU' || stored === 'GPU' ? stored : 'auto', keep: undefined };
}

export class Health {
  delegate: 'GPU' | 'CPU' | '' = '';
  note = ''; // why the CPU took over at the start
  results = 0;
  withFace = 0;
  errors = 0;
  lastError = '';
  private row = 0;
  private fell = false;

  constructor(readonly prefer: Prefer) {}

  ready(delegate: 'GPU' | 'CPU', note = ''): void { this.delegate = delegate; this.note = note.slice(0, 300); this.row = 0; }

  result(faces: number): void { this.results++; if (faces > 0) this.withFace++; this.row = 0; }

  private fall(): boolean {
    if (this.fell || this.prefer !== 'auto' || this.delegate === 'CPU') return false;
    return (this.fell = true);
  }

  // True: start the tracker again on the CPU. One time only, and only when nobody forced a tracker.
  error(message: string): boolean {
    this.errors++;
    this.lastError = String(message).slice(0, 300);
    return this.delegate === 'GPU' && ++this.row >= ERRORS_TO_FALL_BACK && this.fall();
  }

  // The tracker did not start, or its worker died
  failed(message: string): boolean {
    this.errors++;
    this.lastError = String(message).slice(0, 300);
    return this.fall();
  }
}
