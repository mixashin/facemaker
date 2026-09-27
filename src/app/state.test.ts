import { describe, it, expect } from 'vitest';
import { camStateFromError, controlsUp } from './state';

describe('camStateFromError', () => {
  it('maps permission errors to denied', () => {
    expect(camStateFromError('NotAllowedError')).toBe('denied');
    expect(camStateFromError('SecurityError')).toBe('denied');
  });
  it('maps missing hardware to nocam', () => {
    expect(camStateFromError('NotFoundError')).toBe('nocam');
    expect(camStateFromError('OverconstrainedError')).toBe('nocam');
  });
  it('maps anything else to error', () => {
    expect(camStateFromError('AbortError')).toBe('error');
  });
});

describe('controlsUp', () => {
  it('shows the buttons while the camera runs', () => {
    expect(controlsUp('live', true)).toBe(true);
  });
  it('keeps the buttons while a camera that ran before starts again: a flip, a return from the background', () => {
    expect(controlsUp('starting', true)).toBe(true);
  });
  it('shows no button before the first picture, and none on an error screen', () => {
    expect(controlsUp('starting', false)).toBe(false);
    expect(controlsUp('idle', false)).toBe(false);
    for (const s of ['denied', 'nocam', 'error'] as const) expect(controlsUp(s, true)).toBe(false);
  });
});
