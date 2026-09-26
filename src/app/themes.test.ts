import { describe, it, expect } from 'vitest';
import { THEMES, loadTheme, applyTheme } from './themes';

describe('themes', () => {
  it('has four themes with icons', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['neutral', 'girl', 'boy', 'cyber']);
    for (const t of THEMES) expect(t.icon.length).toBeGreaterThan(0);
  });

  it('loads a stored theme and falls back to neutral', () => {
    expect(loadTheme('girl')).toBe('girl');
    expect(loadTheme('cyber')).toBe('cyber');
    expect(loadTheme('purple')).toBe('neutral');
    expect(loadTheme(null)).toBe('neutral');
  });

  it('applies the theme as a data attribute on the root', () => {
    const attrs: Record<string, string> = {};
    applyTheme('boy', { setAttribute: (n, v) => { attrs[n] = v; } });
    expect(attrs['data-theme']).toBe('boy');
  });
});
