import { signal } from '@preact/signals';
import en from './en.json';
import sr from './sr.json';

export type Lang = 'en' | 'sr';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'sr', label: 'SR' },
];
const TABLES: Record<Lang, Record<string, string>> = { en, sr };
const KEY = 'fm.lang';

export function detectLang(navLang: string, stored: string | null): Lang {
  if (stored === 'en' || stored === 'sr') return stored;
  return /^(sr|hr|bs)(-|$)/i.test(navLang) ? 'sr' : 'en';
}

function storedLang(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export const lang = signal<Lang>(detectLang(typeof navigator === 'undefined' ? 'en' : navigator.language ?? 'en', storedLang()));

export function setLang(l: Lang): void {
  lang.value = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
}

export function t(key: string): string {
  return TABLES[lang.value][key] ?? TABLES.en[key] ?? key;
}
