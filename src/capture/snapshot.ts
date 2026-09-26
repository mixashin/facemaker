export function snapshot(canvas: HTMLCanvasElement, quality = 0.92): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob returned null'));
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      resolve(new File([blob], `facemaker-${ts}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });
}
