import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import list from './attributions.json';

const ALLOWED = /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|MPL-2\.0|Unlicense|CC0-1\.0|CC-BY-4\.0)(\s+AND\s+(MIT|Apache-2\.0|CC-BY-4\.0))?$/;

describe('attributions', () => {
  it('covers every runtime dependency in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const names = new Set(list.map((e) => e.name));
    for (const dep of Object.keys(pkg.dependencies)) expect(names.has(dep), `missing ${dep}: run node scripts/attributions.mjs`).toBe(true);
  });

  it('lists the shipped assets', () => {
    const names = list.map((e) => e.name);
    expect(names).toContain('Twemoji graphics');
    expect(names).toContain('Fluent Emoji graphics');
    expect(names).toContain('MediaPipe Face Landmarker model');
    expect(names).toContain('MediaPipe canonical face model');
    expect(names).toContain('MediaPipe Selfie Segmenter model');
    expect(names).toContain('Facemaker art by Astra');
    expect(names).toContain('Workbox');
  });

  it('uses only allowed licenses and has a url per entry', () => {
    for (const e of list) {
      expect(e.license, e.name).toMatch(ALLOWED);
      expect(e.url, e.name).toMatch(/^https:\/\//);
    }
  });
});
