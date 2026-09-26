// Copies only the Twemoji SVGs the sticker packs use into public/stickers (served from the app origin).
// Twemoji graphics: CC-BY 4.0 (https://github.com/jdecked/twemoji). Listed in the About screen.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@twemoji/svg';
if (!existsSync(src)) process.exit(0);
const dst = 'public/stickers';
mkdirSync(dst, { recursive: true });

// Codepoints, lowercase hex, variation selector FE0F dropped (Twemoji file naming).
const FILES = [
  '1f431', '1f436', '1f981', '1f438', '1f435', '1f437', '1f43c', '1f428', '1f47b', '1f978', // animal and face masks
  '1f576', '1f453', '1f451', '1f3a9', '1f380', '1f338', '2b50', '2764', '1f445',           // props
];
for (const f of FILES) copyFileSync(`${src}/${f}.svg`, `${dst}/${f}.svg`);
console.log('copied', FILES.length, 'twemoji svgs to', dst);
