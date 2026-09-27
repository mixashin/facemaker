export type Facing = 'user' | 'environment';
type Devices = Pick<MediaDevices, 'getUserMedia'>;
type Page = Pick<Document, 'hidden'>;

let latest = 0; // the number of the newest start: that one has the camera

const end = (s: MediaStream | null): void => s?.getTracks().forEach((t) => t.stop());

// No camera in the background, and one camera at a time. Gives null when the start has no use any more: the
// page is hidden, a newer start came, or somebody stopped the camera while the video started to play. A stream
// that arrives then is stopped, an error that arrives then says nothing about the camera. The start on return
// does the work (startOnReturn).
export async function startCamera(video: HTMLVideoElement, facing: Facing, devices: Devices = navigator.mediaDevices, page: Page = document): Promise<MediaStream | null> {
  const mine = ++latest;
  const gone = () => mine !== latest || page.hidden;
  stopCamera(video);
  if (gone()) return null;
  let stream: MediaStream;
  try {
    stream = await devices.getUserMedia({
      audio: false,
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (e) {
    if (gone()) return null;
    throw e;
  }
  if (gone()) { end(stream); return null; }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
    if (video.videoWidth === 0) {
      // The size of the picture comes, or the camera stops first (emptied): the wait ends in both cases
      await new Promise<void>((r) => {
        const over = new AbortController();
        for (const e of ['loadedmetadata', 'emptied']) video.addEventListener(e, () => { over.abort(); r(); }, { signal: over.signal });
      });
    }
  } catch (e) {
    if (video.srcObject === stream) throw e; // else: somebody stopped the camera while the video started to play
  }
  return video.srcObject === stream ? stream : null;
}

export function stopCamera(video: HTMLVideoElement): void {
  end(video.srcObject as MediaStream | null);
  video.srcObject = null;
}

// Another app took the camera (the file picker can open the camera app): the track ended, the picture stands still.
export function cameraLost(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  return !track || track.readyState === 'ended';
}

// The page is back in front. The camera starts again when the app had one, or waited for one, and it is gone.
// After an error too: the camera was busy or the phone was locked, and that can be over now. The screens for
// no permission and no camera stay: a new try does not cure them.
export function startOnReturn(state: string, stream: MediaStream | null): boolean {
  return (state === 'live' || state === 'starting' || state === 'error') && cameraLost(stream);
}

// A camera can be busy for a moment: another app gives it back, a second page of the app holds it, the phone
// wakes up. The start gets new tries before the error screen shows: a tap on that screen loads the app again,
// and the child loses its picks. Gives the wait before the next try, or null for the error screen.
export const RETRY_MS = [500, 2000];
export function retryIn(state: 'denied' | 'nocam' | 'error', tries: number): number | null {
  return state === 'error' && tries < RETRY_MS.length ? RETRY_MS[tries] : null;
}
