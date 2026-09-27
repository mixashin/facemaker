import { describe, it, expect } from 'vitest';
import { cameraLost } from './camera';

const stream = (...states: string[]) => ({ getVideoTracks: () => states.map((readyState) => ({ readyState })) }) as unknown as MediaStream;

describe('cameraLost', () => {
  it('is true without a stream and without a video track', () => {
    expect(cameraLost(null)).toBe(true);
    expect(cameraLost(stream())).toBe(true);
  });
  it('is true when the track ended (another app took the camera)', () => {
    expect(cameraLost(stream('ended'))).toBe(true);
  });
  it('is false while the track is live', () => {
    expect(cameraLost(stream('live'))).toBe(false);
  });
});
