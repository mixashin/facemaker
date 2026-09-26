export type ThemeId = 'neutral' | 'girl' | 'boy' | 'cyber';

export const THEMES: { id: ThemeId; icon: string }[] = [
  { id: 'neutral', icon: '🌙' },
  { id: 'girl', icon: '🌸' },
  { id: 'boy', icon: '🚀' },
  { id: 'cyber', icon: '🤖' },
];

const KEY = 'fm.theme';

export function loadTheme(stored: string | null): ThemeId {
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : 'neutral';
}

export function applyTheme(id: ThemeId, root: { setAttribute(n: string, v: string): void } = document.documentElement): void {
  root.setAttribute('data-theme', id);
  try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
}

export function initTheme(): ThemeId {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  const id = loadTheme(stored);
  applyTheme(id);
  return id;
}
