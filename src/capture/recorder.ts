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

export class Recorder {
  private rec: Rec | null = null;
  private done: Promise<File | null> = Promise.resolve(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
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

  start(stream: MediaStream, onAutoStop?: () => void): boolean {
    if (this.rec) return false;
    const mime = pickMimeType(this.isSupported, this.order);
    if (!mime) return false;
    try {
      const options: MediaRecorderOptions = { mimeType: mime };
      if (this.bits > 0) options.videoBitsPerSecond = this.bits;
      const rec = new this.Ctor(stream, options);
      const chunks: Blob[] = [];
      const name = recordName(extFor(mime), this.now());
      const type = mime.split(';')[0];
      this.done = new Promise((resolve) => {
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => resolve(chunks.length ? new File(chunks, name, { type }) : null);
        rec.onerror = () => resolve(null);
      });
      rec.start();
      this.rec = rec;
      this.timer = setTimeout(() => onAutoStop?.(), this.maxMs);
      return true;
    } catch (e) {
      console.warn('recorder start failed', e);
      this.rec = null;
      return false;
    }
  }

  async stop(): Promise<File | null> {
    const rec = this.rec;
    if (!rec) return null;
    clearTimeout(this.timer);
    this.rec = null;
    try { if (rec.state !== 'inactive') rec.stop(); } catch { return null; }
    return this.done;
  }
}
