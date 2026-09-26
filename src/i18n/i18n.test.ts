import { describe, it, expect } from 'vitest';
import { detectLang, t, setLang } from './i18n';
import en from './en.json';
import sr from './sr.json';

describe('i18n', () => {
  it('detects Serbian from any sr, hr or bs locale, else English', () => {
    expect(detectLang('sr-RS', null)).toBe('sr');
    expect(detectLang('sr-Latn-RS', null)).toBe('sr');
    expect(detectLang('sr-Cyrl-RS', null)).toBe('sr');
    expect(detectLang('hr', null)).toBe('sr');
    expect(detectLang('bs-BA', null)).toBe('sr');
    expect(detectLang('en-GB', null)).toBe('en');
    expect(detectLang('de-DE', null)).toBe('en');
    expect(detectLang('', null)).toBe('en');
  });

  it('a stored valid choice wins, an invalid stored value is ignored', () => {
    expect(detectLang('sr-RS', 'en')).toBe('en');
    expect(detectLang('en-US', 'sr')).toBe('sr');
    expect(detectLang('en-US', 'bogus')).toBe('en');
  });

  it('translates in the current language, falls back to English, then to the key', () => {
    setLang('sr');
    expect(t('tabs.text')).toBe('Tekst');
    setLang('en');
    expect(t('tabs.text')).toBe('Text');
    expect(t('nope.missing')).toBe('nope.missing');
  });

  it('sr has every en key and no empty strings', () => {
    for (const k of Object.keys(en)) {
      expect(sr, `missing sr key ${k}`).toHaveProperty(k);
      expect((sr as Record<string, string>)[k].length, `empty sr ${k}`).toBeGreaterThan(0);
    }
  });

  it('every tutorial step and the privacy lines have text in both languages', () => {
    for (const k of ['tutorial.record', 'privacy.p4', 'privacy.p5', 'tabs.voice', 'voice.try', 'voice.denied']) {
      expect((en as Record<string, string>)[k], `en ${k}`).toBeTruthy();
      expect((sr as Record<string, string>)[k], `sr ${k}`).toBeTruthy();
    }
  });

  it('the privacy page tells the truth about storage: photos and videos stay on the device', () => {
    expect((en as Record<string, string>)['privacy.p4']).not.toMatch(/does not keep/i);
    expect((en as Record<string, string>)['privacy.p4']).toMatch(/on this device/i);
    expect((en as Record<string, string>)['privacy.p5']).toMatch(/microphone/i);
  });
});
