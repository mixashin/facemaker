import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { STICKER_PACKS, MAX_STICKERS, emojiFile, isMask, spritesFor, spritesForAll, toggleSticker, faceSprites } from './stickers';
import type { Face } from '../tracking/faceTracker';
// @ts-expect-error plain node script, no types; one copy of the scan for the fetch script and this test
import { unsafeSvg } from '../../scripts/fetch-fluent.mjs';

const ASPECT = 16 / 9;

function face(rightEyeDy = 0): Face {
  const lm = new Float32Array(478 * 3);
  const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5);                 // cheeks: face width 0.4
  set(10, 0.5, 0.2); set(152, 0.5, 0.8);                  // top, chin: face height 0.6
  set(13, 0.5, 0.62); set(14, 0.5, 0.64);                 // inner lips
  for (let i = 468; i < 473; i++) set(i, 0.42, 0.45);     // left iris
  for (let i = 473; i < 478; i++) set(i, 0.58, 0.45 + rightEyeDy); // right iris
  set(4, 0.5, 0.5);                                       // nose tip
  return { landmarks: lm, matrix: new Float32Array(16), blend: new Float32Array(52) };
}

describe('emojiFile', () => {
  it('maps an emoji to its Twemoji file, dropping the variation selector', () => {
    expect(emojiFile('🐱')).toBe('/stickers/1f431.svg');
    expect(emojiFile('❤️')).toBe('/stickers/2764.svg');
    expect(emojiFile('🕶️')).toBe('/stickers/1f576.svg');
  });

  it('maps an emoji to its Fluent file when the pack art is fluent', () => {
    expect(emojiFile('🐯', 'fluent')).toBe('/stickers/fluent/1f42f.svg');
    expect(emojiFile('🎀', 'fluent')).toBe('/stickers/fluent/1f380.svg');
    expect(emojiFile('🎀', 'twemoji')).toBe('/stickers/1f380.svg');
  });
});

describe('STICKER_PACKS', () => {
  it('starts with none and has an icon per pack', () => {
    expect(STICKER_PACKS[0].id).toBe('none');
    expect(STICKER_PACKS[0].items).toEqual([]);
    for (const p of STICKER_PACKS) expect(p.icon.length).toBeGreaterThan(0);
  });

  it('every emoji used has its svg on disk (scripts/copy-twemoji.mjs, scripts/fetch-fluent.mjs)', () => {
    for (const p of STICKER_PACKS) for (const it of p.items) {
      const file = 'src' in it ? it.src : emojiFile(it.emoji, p.art);
      expect(existsSync('public' + file), `${p.id}: ${file}`).toBe(true);
    }
  });

  it('a placement can name its file: the sprite shows that file', () => {
    const lm = new Float32Array(478 * 3);
    const set = (i: number, x: number, y: number) => { lm[i * 3] = x; lm[i * 3 + 1] = y; };
    set(234, 0.3, 0.5); set(454, 0.7, 0.5); set(10, 0.5, 0.2); set(152, 0.5, 0.8); set(4, 0.5, 0.5);
    for (const i of [468, 469, 470, 471, 472]) set(i, 0.4, 0.4);
    for (const i of [473, 474, 475, 476, 477]) set(i, 0.6, 0.4);
    const s = faceSprites([{ src: '/props/clown-nose.webp', anchor: 'nose', scale: 0.25 }, { emoji: '👑', anchor: 'top', scale: 0.7 }], undefined, lm, 1);
    expect(s[0].src).toBe('/props/clown-nose.webp');
    expect(s[0].cx).toBeCloseTo(0.5); expect(s[0].cy).toBeCloseTo(0.5);
    expect(s[0].size).toBeCloseTo(0.25 * 0.4);
    expect(s[1].src).toBe(emojiFile('👑'));
  });

  it('has the Fluent packs next to the Twemoji ones, nothing removed', () => {
    const ids = STICKER_PACKS.map((p) => p.id);
    for (const id of ['cat', 'dog', 'lion', 'ghost', 'disguise', 'sunglasses', 'crown', 'bow', 'stars', 'hearts', 'tongue']) expect(ids).toContain(id);
    const fluent = STICKER_PACKS.filter((p) => p.art === 'fluent');
    expect(fluent.length).toBeGreaterThanOrEqual(20);
    for (const id of ['fluent-tiger', 'fluent-unicorn', 'fluent-nerd', 'fluent-rainbow', 'fluent-gradcap']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the real art on every sticker chip (img), the none chip stays a glyph', () => {
    expect(STICKER_PACKS[0].img).toBeUndefined();
    for (const p of STICKER_PACKS.slice(1)) expect(existsSync('public' + p.img!), p.id).toBe(true);
  });
});

describe('sticker svgs are art, not code', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.svg') ? [`${dir}/${e.name}`] : []));
  it('no script, no event handler, no external reference in any shipped sticker', () => {
    const files = walk('public/stickers');
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) expect(unsafeSvg(readFileSync(f, 'utf8')), f).toBeNull();
  });

  it('the scan refuses every construct that can run or fetch, in any quoting', () => {
    const bad = [
      '<svg><script>1</script></svg>', '<svg><svg:script>1</svg:script></svg>', "<svg><image href='https://x/a.png'/></svg>",
      "<svg><use xlink:href='https://x/a.svg#i'/></svg>", '<svg><foreignObject><iframe src="https://x"/></foreignObject></svg>',
      "<?xml-stylesheet href='https://x/a.css'?><svg/>", '<svg><style>@import "https://x/a.css";</style></svg>',
      '<!DOCTYPE svg [<!ENTITY e "x">]><svg/>', '<svg onload="1"/>', "<svg><a href='javascript:1'/></svg>",
      '<svg><rect fill="url(https://x/a.svg#g)"/></svg>', '<svg><set attributeName="onload" to="1"/></svg>',
    ];
    for (const b of bad) expect(unsafeSvg(b), b).not.toBeNull();
    const ok = [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect fill="url(#g)"/></svg>',
      '<svg contentScriptType="text/ecmascript"><path d="M0 0"/></svg>',
      '<svg><g style="mix-blend-mode:multiply"><circle r="1" fill="#f00"/></g></svg>',
    ];
    for (const o of ok) expect(unsafeSvg(o), o).toBeNull();
  });
});

describe('spritesFor', () => {
  it('fluent packs resolve their sprites to the fluent files', () => {
    const s = spritesFor('fluent-tiger', [face()], ASPECT);
    expect(s).toHaveLength(1);
    expect(s[0].src).toBe('/stickers/fluent/1f42f.svg');
  });

  it('returns nothing for none or for no faces', () => {
    expect(spritesFor('none', [face()], ASPECT)).toEqual([]);
    expect(spritesFor('cat', [], ASPECT)).toEqual([]);
    expect(spritesFor('unknown', [face()], ASPECT)).toEqual([]);
  });

  it('cat mask sits on the face centre, sized 1.25 of the larger face dimension in x units', () => {
    const s = spritesFor('cat', [face()], ASPECT);
    expect(s).toHaveLength(1);
    expect(s[0].src).toBe('/stickers/1f431.svg');
    expect(s[0].cx).toBeCloseTo(0.5, 4); expect(s[0].cy).toBeCloseTo(0.5, 4);
    const heightX = 0.6 / ASPECT; // 0.3375
    expect(s[0].size).toBeCloseTo(1.25 * Math.max(0.4, heightX), 4);
    expect(s[0].angle).toBeCloseTo(0, 6);
  });

  it('hearts land on both irises', () => {
    const s = spritesFor('hearts', [face()], ASPECT);
    expect(s).toHaveLength(2);
    expect(s[0].cx).toBeCloseTo(0.42, 4); expect(s[1].cx).toBeCloseTo(0.58, 4);
    expect(s[0].cy).toBeCloseTo(0.45, 4);
  });

  it('crown sits above the forehead', () => {
    const s = spritesFor('crown', [face()], ASPECT);
    expect(s[0].cy).toBeLessThan(0.2);
    expect(s[0].cx).toBeCloseTo(0.5, 4);
  });

  it('angle follows the eye line, corrected for aspect', () => {
    const s = spritesFor('sunglasses', [face(0.1)], ASPECT);
    expect(s[0].angle).toBeCloseTo(Math.atan2(0.1 / ASPECT, 0.16), 4);
  });

  it('two faces get stickers each', () => {
    expect(spritesFor('stars', [face(), face()], ASPECT)).toHaveLength(4);
  });
});

describe('isMask', () => {
  it('a pack that covers the whole face is a mask, a hat or glasses is a prop', () => {
    for (const id of ['cat', 'dog', 'ghost', 'disguise', 'fluent-tiger', 'fluent-nerd', 'fluent-cowboy']) expect(isMask(id), id).toBe(true);
    for (const id of ['crown', 'sunglasses', 'stars', 'hearts', 'tongue', 'fluent-rainbow', 'fluent-gradcap', 'none', 'unknown']) expect(isMask(id), id).toBe(false);
  });
});

describe('toggleSticker', () => {
  it('props combine: a tap turns one on, a second tap turns it off, the order of the picks is kept', () => {
    let a = toggleSticker([], 'crown');
    a = toggleSticker(a, 'sunglasses');
    a = toggleSticker(a, 'stars');
    expect(a).toEqual(['crown', 'sunglasses', 'stars']);
    expect(toggleSticker(a, 'sunglasses')).toEqual(['crown', 'stars']);
  });

  it('a mask replaces the mask that is on and keeps the props: two masks would only cover each other', () => {
    expect(toggleSticker(['cat', 'crown', 'sunglasses'], 'fluent-tiger')).toEqual(['crown', 'sunglasses', 'fluent-tiger']);
    expect(toggleSticker(['crown'], 'cat')).toEqual(['crown', 'cat']);
    expect(toggleSticker(['cat', 'crown'], 'cat')).toEqual(['crown']);
  });

  it('none clears everything and is never in the list', () => {
    expect(toggleSticker(['cat', 'crown'], 'none')).toEqual([]);
    expect(toggleSticker([], 'none')).toEqual([]);
  });

  it('holds five at most: the oldest pick makes room', () => {
    expect(MAX_STICKERS).toBe(5);
    const five = ['crown', 'sunglasses', 'stars', 'hearts', 'tongue'];
    expect(toggleSticker(five, 'bow')).toEqual(['sunglasses', 'stars', 'hearts', 'tongue', 'bow']);
    expect(toggleSticker(five, 'cat')).toEqual(['sunglasses', 'stars', 'hearts', 'tongue', 'cat']);
  });

  it('an unknown id changes nothing, and the given list is never changed', () => {
    const a = ['crown'];
    expect(toggleSticker(a, 'nope')).toEqual(['crown']);
    toggleSticker(a, 'stars');
    toggleSticker(a, 'crown');
    expect(a).toEqual(['crown']);
  });
});

describe('spritesForAll', () => {
  const srcs = (ids: string[], faces = [face()]) => spritesForAll(ids, faces, ASPECT).map((x) => x.src);

  it('returns nothing without packs or without faces', () => {
    expect(spritesForAll([], [face()], ASPECT)).toEqual([]);
    expect(spritesForAll(['cat'], [], ASPECT)).toEqual([]);
    expect(spritesForAll(['unknown'], [face()], ASPECT)).toEqual([]);
  });

  it('one pack gives the same sprites as before', () => {
    expect(spritesForAll(['hearts'], [face()], ASPECT)).toEqual(spritesFor('hearts', [face()], ASPECT));
  });

  it('draws the mask first and the props on top, whatever the order of the picks', () => {
    const cat = '/stickers/1f431.svg', crown = '/stickers/1f451.svg', shades = '/stickers/1f576.svg';
    expect(srcs(['crown', 'cat', 'sunglasses'])).toEqual([cat, crown, shades]);
    expect(srcs(['sunglasses', 'crown', 'cat'])).toEqual([cat, shades, crown]);
  });

  it('keeps the sprites of each face together, so the mask of the second face does not cover the hat of the first', () => {
    const one = srcs(['crown', 'cat']);
    expect(srcs(['crown', 'cat'], [face(), face()])).toEqual([...one, ...one]);
  });

  it('five packs on two faces give every sprite', () => {
    expect(spritesForAll(['cat', 'crown', 'sunglasses', 'stars', 'hearts'], [face(), face()], ASPECT)).toHaveLength(2 * (1 + 1 + 1 + 2 + 2));
  });
});
