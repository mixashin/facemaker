import { describe, it, expect } from 'vitest';
import { STEPS, loadTutorialSeen, shouldShowTutorial } from './tutorialState';

describe('tutorial', () => {
  it('has four steps with icons and i18n keys', () => {
    expect(STEPS).toHaveLength(4);
    for (const s of STEPS) { expect(s.icon.length).toBeGreaterThan(0); expect(s.key.startsWith('tutorial.')).toBe(true); }
  });

  it('reads the seen flag from storage', () => {
    expect(loadTutorialSeen('1')).toBe(true);
    expect(loadTutorialSeen(null)).toBe(false);
    expect(loadTutorialSeen('yes')).toBe(false);
  });

  it('shows only once the camera is live and the tutorial was not seen', () => {
    expect(shouldShowTutorial(false, 'live')).toBe(true);
    expect(shouldShowTutorial(false, 'starting')).toBe(false);
    expect(shouldShowTutorial(false, 'denied')).toBe(false);
    expect(shouldShowTutorial(true, 'live')).toBe(false);
  });
});
