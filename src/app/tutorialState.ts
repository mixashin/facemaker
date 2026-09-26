import { tutorialSeen, type CamState } from './state';

export const STEPS = [
  { icon: '🎭', key: 'tutorial.filters' },
  { icon: '🐱', key: 'tutorial.stickers' },
  { icon: '⚪', key: 'tutorial.shutter' },
  { icon: '📤', key: 'tutorial.share' },
];
const KEY = 'fm.tutorialSeen';

export function loadTutorialSeen(stored: string | null): boolean { return stored === '1'; }

export function shouldShowTutorial(seen: boolean, camState: CamState): boolean { return !seen && camState === 'live'; }

export function markTutorialSeen(seen: boolean): void {
  tutorialSeen.value = seen;
  try { if (seen) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function initTutorialSeen(): boolean {
  let s: string | null = null;
  try { s = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  return loadTutorialSeen(s);
}
