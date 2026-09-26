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
