import { coverCrop, type Crop } from './snapshot';
import { evenSize } from './recorder';

// captureStream records a whole canvas, and the stage canvas is wider than what the screen shows
// (object-fit: cover). This second canvas holds exactly the visible crop, so videos match photos.
export class RecordCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private crop: Crop;

  constructor(stage: { width: number; height: number }, view: { width: number; height: number }, doc: Pick<Document, 'createElement'> = document) {
    this.crop = coverCrop(stage.width, stage.height, view.width, view.height);
    const s = evenSize(this.crop.w, this.crop.h);
    this.canvas = doc.createElement('canvas') as HTMLCanvasElement;
    this.canvas.width = s.width;
    this.canvas.height = s.height;
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(stage: CanvasImageSource): void {
    const c = this.crop;
    this.ctx.drawImage(stage, c.x, c.y, c.w, c.h, 0, 0, this.canvas.width, this.canvas.height);
  }

  stream(fps = 30, audio: MediaStream | null = null): MediaStream {
    const s = this.canvas.captureStream(fps);
    const track = audio?.getAudioTracks()[0];
    if (track) s.addTrack(track);
    return s;
  }
}
