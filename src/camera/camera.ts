export type Facing = 'user' | 'environment';

export async function startCamera(video: HTMLVideoElement, facing: Facing): Promise<MediaStream> {
  stopCamera(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true }));
  }
  return stream;
}

export function stopCamera(video: HTMLVideoElement): void {
  const s = video.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

// Another app took the camera (the file picker can open the camera app): the track ended, the picture stands still.
export function cameraLost(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  return !track || track.readyState === 'ended';
}
