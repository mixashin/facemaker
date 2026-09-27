export type Facing = 'user' | 'environment';
type Devices = Pick<MediaDevices, 'getUserMedia'>;
type Page = Pick<Document, 'hidden'>;

let latest = 0; // the number of the newest start: that one has the camera

const end = (s: MediaStream | null): void => s?.getTracks().forEach((t) => t.stop());

// No camera in the background, and one camera at a time. Gives null when the start has no use any more: the
// page is hidden, or a newer start came. A stream that arrives then is stopped, an error that arrives then
// says nothing about the camera. The start on return does the work (startOnReturn).
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
      await new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true }));
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
// The error screens stay: the child has a button there.
export function startOnReturn(state: string, stream: MediaStream | null): boolean {
  return (state === 'live' || state === 'starting') && cameraLost(stream);
}
