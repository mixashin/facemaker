import { describe, it, expect } from 'vitest';
import { STEPS, loadTutorialSeen, shouldShowTutorial } from './tutorialState';

describe('tutorial', () => {
  it('has five steps with icons and i18n keys, the video step right after the photo step', () => {
    expect(STEPS).toHaveLength(5);
    for (const s of STEPS) { expect(s.icon.length).toBeGreaterThan(0); expect(s.key.startsWith('tutorial.')).toBe(true); }
    expect(STEPS.map((s) => s.key)).toEqual(['tutorial.filters', 'tutorial.stickers', 'tutorial.shutter', 'tutorial.record', 'tutorial.share']);
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
