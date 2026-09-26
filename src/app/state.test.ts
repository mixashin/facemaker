import { describe, it, expect } from 'vitest';
import { camStateFromError } from './state';

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
