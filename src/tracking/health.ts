// State of the face tracker, for the device report and for its new starts.
// Found 2026-09-27 on a phone: the tracker gave 7 results, then the face geometry step of MediaPipe failed, and
// after that every frame failed ("Graph has errors"). A graph with an error stays broken. The place behind the
// person worked (own worker), and the app showed nothing about the tracker.
export type Prefer = 'auto' | 'GPU' | 'CPU';
export type Action = 'none' | 'cpu' | 'again'; // cpu: a new start on the CPU. again: a new start on the same tracker
export const PREFER_KEY = 'fm.tracker';
export const FELL_KEY = 'fm.tracker.fell'; // the browser (user agent) on which the GPU failed
export const ERRORS_TO_RESTART = 5; // errors in a row
export const RESTART_GAP_MS = 5000; // between two starts
export const MAX_RESTARTS = 6; // then the tracker rests, until it ran well for a while
export const GOOD_RESULTS = 300; // results with no restart: about 10 s
export const START_LIMIT_MS = 20000; // from "the files are on the device" to "ready"

const WORDS: Record<string, Prefer> = { cpu: 'CPU', gpu: 'GPU', auto: 'auto' };

// The address can force the tracker: ?tracker=cpu, ?tracker=gpu. The word is kept on the device. ?tracker=auto
// takes it away. keep: the value to store, null to remove it, undefined for no change.
export function preferFrom(search: string, stored: string | null): { prefer: Prefer; keep: Prefer | null | undefined } {
  const word = WORDS[(new URLSearchParams(search).get('tracker') ?? '').toLowerCase()];
  if (word === 'auto') return { prefer: 'auto', keep: null };
  if (word) return { prefer: word, keep: word };
  return { prefer: stored === 'CPU' || stored === 'GPU' ? stored : 'auto', keep: undefined };
}

// The tracker of the first start. The GPU failed on this browser before (seen: Adreno 830 with Chrome 154, the GPU
// path gives numbers that are no numbers): the CPU at once, with no failed start first. A new version of the
// browser has a new user agent, and the GPU gets a new try.
export function firstStart(prefer: Prefer, fell: string | null, agent: string): Prefer {
  return prefer === 'auto' && fell !== null && fell === agent ? 'CPU' : prefer;
}

const short = (m: string) => String(m).slice(0, 300);

export class Health {
  files = false; // model and runtime are on the device
  delegate: 'GPU' | 'CPU' | '' = '';
  note = ''; // why the CPU took over at the start
  results = 0;
  withFace = 0;
  errors = 0;
  firstError = ''; // of the row of errors that runs or ran last: it names the cause
  lastError = '';
  restarts = 0;
  private row = 0; // errors in a row since the last result or the last new start
  private bad = 0; // errors since the last result
  private good = 0;
  private budget = MAX_RESTARTS;
  private lastStart = -Infinity;
  private onCpu = false; // the way to the CPU is taken

  constructor(readonly prefer: Prefer) {}

  loaded(): void { this.files = true; }

  ready(delegate: 'GPU' | 'CPU', note = ''): void { this.delegate = delegate; this.note = short(note); this.row = 0; }

  result(faces: number): void {
    this.results++;
    if (faces > 0) this.withFace++;
    this.row = this.bad = 0;
    if (++this.good >= GOOD_RESULTS) this.budget = MAX_RESTARTS;
  }

  private note1(message: string): void {
    this.errors++;
    this.lastError = short(message);
    if (this.bad++ === 0) this.firstError = this.lastError;
    this.row++;
    this.good = 0;
  }

  private start(nowMs: number): Action {
    if (this.budget <= 0 || nowMs - this.lastStart < RESTART_GAP_MS) return 'none';
    this.budget--;
    this.restarts++;
    this.lastStart = nowMs;
    this.row = 0;
    if (this.prefer === 'auto' && this.delegate !== 'CPU' && !this.onCpu) { this.onCpu = true; return 'cpu'; }
    return 'again';
  }

  // An error for a frame. The answer says what the tracker does now.
  error(message: string, nowMs: number): Action {
    this.note1(message);
    return this.row >= ERRORS_TO_RESTART ? this.start(nowMs) : 'none';
  }

  // The tracker did not start, or its worker died
  failed(message: string, nowMs: number): Action {
    this.note1(message);
    return this.start(nowMs);
  }
}
