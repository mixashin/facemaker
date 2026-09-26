// Downloads the Fluent Emoji Color SVGs the sticker packs use into public/stickers/fluent (committed, MIT).
// Source: github.com/microsoft/fluentui-emoji at a pinned commit. No npm package exists, so this runs by hand
// when the list changes, never at install time: node scripts/fetch-fluent.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

export const COMMIT = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'; // main, 2026-09-26
export const REPO = 'https://github.com/microsoft/fluentui-emoji';

// codepoint (lowercase hex, FE0F dropped, same naming as the Twemoji files) -> Fluent asset folder name
export const FILES = {
  // masks
  '1f42f': 'Tiger face', '1f43b': 'Bear', '1f98a': 'Fox', '1f42e': 'Cow face', '1f430': 'Rabbit face', '1f439': 'Hamster',
  '1f984': 'Unicorn', '1f432': 'Dragon face', '1f47d': 'Alien', '1f916': 'Robot', '1f383': 'Jack-o-lantern',
  '1f913': 'Nerd face', '1f9d0': 'Face with monocle', '1f920': 'Cowboy hat face',
  // props
  '1f393': 'Graduation cap', '1f452': 'Womans hat', '1f380': 'Ribbon', '1f31f': 'Glowing star', '1f308': 'Rainbow', '1f98b': 'Butterfly',
};

const slug = (name) => name.toLowerCase().replace(/ /g, '_');
const raw = (path) => `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`;

// The files are art, not code. Refuse anything that could run or fetch: the app makes zero third-party requests.
// The app loads these only through <img> and canvas drawImage (image mode: no script, no subresources), so this is
// a supply-chain guard on the fetch, not a runtime control. Quote-agnostic on purpose.
export function unsafeSvg(text) {
  if (/<!|<\?|<style|@import|[<:]script|<use|<image|<foreignObject|<a[\s>]|<set|<animate|javascript:|[\s"']on[a-z]+\s*=/i.test(text)) return 'script';
  if (/(href|src)\s*=\s*["']?(?!#)|url\(\s*["']?(?!#)/i.test(text.replace(/xmlns(:\w+)?="[^"]*"/g, ''))) return 'external reference';
  return null;
}

async function main() {
  const dst = 'public/stickers/fluent';
  mkdirSync(dst, { recursive: true });
  for (const [cp, name] of Object.entries(FILES)) {
    const res = await fetch(raw(`assets/${name}/Color/${slug(name)}_color.svg`));
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('<svg')) throw new Error(`${name}: not an svg`);
    const bad = unsafeSvg(text);
    if (bad) throw new Error(`${name}: refused, ${bad}`);
    writeFileSync(`${dst}/${cp}.svg`, text);
  }
  const lic = await fetch(raw('LICENSE'));
  if (!lic.ok) throw new Error(`LICENSE: HTTP ${lic.status}`);
  writeFileSync(`${dst}/LICENSE`, await lic.text());
  console.log('fetched', Object.keys(FILES).length, 'fluent svgs + LICENSE into', dst, 'at', COMMIT.slice(0, 7));
}

if (import.meta.main) await main(); // Node 24; false under import (scripts/attributions.mjs, vitest)
