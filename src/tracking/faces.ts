// A face that the tracker gives can be no face: all points at one place, or numbers that are no numbers.
// Seen 2026-09-27 on a phone (GPU path, Adreno 830): such a second face stopped the face geometry step of
// MediaPipe, and the tracker was dead after that. The app uses faces with a size only.
// The check runs in the tracker, not in the worker: the worker is a classic one and can import nothing.
const MIN_SIZE = 0.005; // of the picture. A face that small is 6 px wide in a picture of 1280 px
const MAX_SIZE = 4; // a face close to the camera is wider than the picture, not four times as wide
const POINTS = 478; // with the irises: the app reads them

// lm: x y z of every point of one face, packed
export function usable(lm: Float32Array | null | undefined): boolean {
  if (!lm || lm.length < POINTS * 3) return false;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < lm.length; i += 3) {
    const x = lm[i], y = lm[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(lm[i + 2])) return false;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const size = Math.max(x1 - x0, y1 - y0);
  return size >= MIN_SIZE && size <= MAX_SIZE;
}
