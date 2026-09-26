// MediaRecorder wrapper. mp4 first (Chrome 126+ on Android), webm fallback. No timeslice: one blob at
// stop, and WebM then carries its Duration (Chrome 140+, research/05).
export const MIME_ORDER = ['video/mp4;codecs="avc1.424028,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
export const AUDIO_MIME_ORDER = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
export const MAX_MS = 60_000;

export function pickMimeType(isSupported: (t: string) => boolean, order: string[] = MIME_ORDER): string | null {
  return order.find((t) => isSupported(t)) ?? null;
}

export function extFor(mime: string): 'mp4' | 'webm' {
  return mime.split(';')[0].endsWith('/mp4') ? 'mp4' : 'webm';
}

export function recordName(ext: string, now: Date = new Date()): string {
  return `facemaker-${now.toISOString().replace(/[:.]/g, '-')}.${ext}`;
}

export function evenSize(w: number, h: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(w), height: even(h) };
}

type Rec = {
  state: string;
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};
export type RecCtor = new (stream: MediaStream, options: MediaRecorderOptions) => Rec;
export type RecorderOptions = { maxMs?: number; now?: () => Date; order?: string[]; bitsPerSecond?: number };

const STOP_TIMEOUT_MS = 5000;

export class Recorder {
  private rec: Rec | null = null;
  private done: Promise<File | null> = Promise.resolve(null);
  private resolve: (f: File | null) => void = () => {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private onEnd: (() => void) | undefined;
  // Types that failed while recording. isTypeSupported can say yes and the encoder still refuses after
  // start() (seen 2026-09-27: mp4 with AAC in a Chromium without an AAC encoder). Kept for the session.
  private bad = new Set<string>();
  private maxMs: number;
  private now: () => Date;
  private order: string[];
  private bits: number;

  constructor(private Ctor: RecCtor, private isSupported: (t: string) => boolean, opts: RecorderOptions = {}) {
    this.maxMs = opts.maxMs ?? MAX_MS;
    this.now = opts.now ?? (() => new Date());
    this.order = opts.order ?? MIME_ORDER;
    this.bits = opts.bitsPerSecond ?? 4_000_000;
  }

  get active(): boolean { return this.rec !== null; }

  // onEnd fires when the clip ends by itself: the time cap, or every type failed.
  start(stream: MediaStream, onEnd?: () => void): boolean {
    if (this.rec) return false;
    let resolve: (f: File | null) => void = () => {};
    this.done = new Promise((r) => { resolve = r; });
    this.resolve = resolve; // every handler and timer of this clip keeps its own resolver
    if (!this.begin(stream, resolve)) { resolve(null); return false; }
    this.onEnd = onEnd;
    this.timer = setTimeout(() => onEnd?.(), this.maxMs);
    return true;
  }

  // Starts the first type that constructs. A type that fails later restarts here with the next one.
  private begin(stream: MediaStream, resolve: (f: File | null) => void): boolean {
    const skip = new Set<string>(); // constructor refusals, this attempt only
    for (;;) {
      const mime = pickMimeType(this.isSupported, this.order.filter((t) => !this.bad.has(t) && !skip.has(t)));
      if (!mime) return false;
      try {
        const options: MediaRecorderOptions = { mimeType: mime };
        if (this.bits > 0) options.videoBitsPerSecond = this.bits;
        const rec = new this.Ctor(stream, options);
        const chunks: Blob[] = [];
        const name = recordName(extFor(mime), this.now());
        const type = mime.split(';')[0];
        let failed = false;
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => { if (!failed) resolve(chunks.length ? new File(chunks, name, { type }) : null); };
        rec.onerror = () => {
          failed = true;
          this.bad.add(mime);
          console.warn('recorder failed, next type', mime);
          if (this.rec !== rec) { resolve(null); return; } // already released: never start again
          this.rec = null;
          if (this.begin(stream, resolve)) return;
          clearTimeout(this.timer);
          resolve(null);
          this.onEnd?.();
        };
        rec.start();
        this.rec = rec;
        return true;
      } catch (e) {
        console.warn('recorder start failed', mime, e);
        skip.add(mime);
      }
    }
  }

  async stop(): Promise<File | null> {
    const rec = this.rec;
    if (!rec) return null;
    clearTimeout(this.timer);
    this.rec = null;
    const resolve = this.resolve, done = this.done; // this clip's, not the next one's
    try {
      if (rec.state === 'inactive') resolve(null);
      else rec.stop();
    } catch {
      resolve(null);
    }
    setTimeout(() => resolve(null), STOP_TIMEOUT_MS); // a recorder that never reports back must not lock the shutter
    return done;
  }
}
