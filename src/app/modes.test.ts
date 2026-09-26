import { describe, it, expect } from 'vitest';
import { toggleMode } from './modes';

describe('toggleMode', () => {
  it('opens a closed tab', () => {
    expect(toggleMode('none', 'warp')).toBe('warp');
  });
  it('closes the open tab on a second tap', () => {
    expect(toggleMode('warp', 'warp')).toBe('none');
  });
  it('switches between tabs directly', () => {
    expect(toggleMode('warp', 'sticker')).toBe('sticker');
    expect(toggleMode('sticker', 'text')).toBe('text');
  });
});
