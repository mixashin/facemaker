import type { Face } from '../tracking/faceTracker';

export type Anchor = 'face' | 'eyes' | 'leftEye' | 'rightEye' | 'top' | 'mouth' | 'nose' | 'leftCheek' | 'rightCheek';
// What is placed: an emoji (its file comes from the art of the pack), or a file by its address (props by Astra).
// Where: anchor, scale and offsets in face-width units.
export type Placement = ({ emoji: string } | { src: string }) & { anchor: Anchor; scale: number; dx?: number; dy?: number };
export type Art = 'twemoji' | 'fluent'; // two sticker sources, same emoji keys, different files (see LICENSE-ASSETS.md)
export type StickerPack = { id: string; icon: string; img?: string; art?: Art; items: Placement[] };
export type Sprite = { src: string; cx: number; cy: number; size: number; angle: number };

export function emojiFile(emoji: string, art: Art = 'twemoji'): string {
  const cps = [...emoji].map((c) => c.codePointAt(0)!).filter((cp) => cp !== 0xfe0f);
  return `/stickers/${art === 'fluent' ? 'fluent/' : ''}${cps.map((cp) => cp.toString(16)).join('-')}.svg`;
}

const mask = (id: string, emoji: string, scale = 1.25): StickerPack => ({ id, icon: emoji, items: [{ emoji, anchor: 'face', scale }] });
const fmask = (id: string, emoji: string, scale = 1.25): StickerPack => ({ ...mask(`fluent-${id}`, emoji, scale), art: 'fluent' });
const fluent = (id: string, icon: string, items: Placement[]): StickerPack => ({ id: `fluent-${id}`, icon, art: 'fluent', items });

// Props by Astra (public/props, list in props.json): one line per pack, a spot is [anchor, scale, dx, dy].
// The chip shows the prop itself, the icon is the fallback. Every prop fills 92 % of its square, centred.
// The numbers are set on a face with true proportions (FACE_FIT=crop in scripts/smoke.mjs). The screen mirrors the camera:
// leftEye and leftCheek show on the right side of the screen, a positive dx moves a prop to the left side of the screen.
type Spot = [anchor: Anchor, scale: number, dx?: number, dy?: number];
const prop = (name: string, icon: string, ...spots: Spot[]): StickerPack => {
  const src = `/props/${name}.webp`;
  return { id: `prop-${name}`, icon, img: src, items: spots.map(([anchor, scale, dx = 0, dy = 0]) => ({ src, anchor, scale, dx, dy })) };
};

const packs: StickerPack[] = [
  { id: 'none', icon: '🙂', items: [] },
  // Head
  prop('pirate-hat', '☠️', ['top', 1.45, 0, -0.2]),
  prop('party-hat', '🥳', ['top', 1.0, 0, -0.47]),
  prop('baseball-cap', '🧢', ['top', 1.2, 0, -0.3]),
  prop('chef-hat', '🍳', ['top', 1.4, 0, -0.57]),
  prop('witch-hat', '🧙', ['top', 1.5, 0, -0.5]),
  prop('viking-helmet', '🛡️', ['top', 1.45, 0, -0.26]),
  prop('tiara', '👸', ['top', 0.8, 0, -0.14]),
  prop('halo', '😇', ['top', 0.85, 0, -0.6]),
  prop('devil-horns', '😈', ['top', 1.0, 0, -0.22]),
  prop('bunny-ears', '🐰', ['top', 1.4, 0, -0.51]),
  prop('cat-ears', '🐱', ['top', 1.45, 0, -0.1]),
  prop('headphones', '🎧', ['top', 1.8, 0, 0.5]),
  // Eyes
  prop('googly-eye', '👀', ['leftEye', 0.32], ['rightEye', 0.32]),
  prop('cucumber-slice', '🥒', ['leftEye', 0.35], ['rightEye', 0.35]),
  prop('eyepatch', '🦜', ['leftEye', 0.8]),
  prop('tear-drop', '😢', ['rightEye', 0.17, 0, 0.2]),
  // Nose and mouth
  prop('clown-nose', '🤡', ['nose', 0.3]),
  prop('pig-nose', '🐽', ['nose', 0.4]),
  prop('moustache-handlebar', '🥸', ['nose', 0.6, 0, 0.1]),
  prop('moustache-walrus', '🦭', ['nose', 0.6, 0, 0.11]),
  prop('beard-pirate', '🧔', ['mouth', 1.0, 0, 0.2]),
  prop('braces', '😬', ['mouth', 0.55]),
  prop('gum-bubble', '🫧', ['mouth', 0.6, 0, 0.08]),
  prop('bow-tie', '🤵', ['mouth', 0.65, 0, 0.75]),
  // Cheeks and skin
  prop('blush', '😊', ['leftCheek', 0.35, 0.08, 0.12], ['rightCheek', 0.35, -0.08, 0.12]),
  prop('freckles', '🟤', ['leftCheek', 0.3, 0.08, 0.1], ['rightCheek', 0.3, -0.08, 0.1]),
  prop('pimple', '🔴', ['leftCheek', 0.13, 0.12, 0.25]),
  prop('band-aid', '🩹', ['leftCheek', 0.3, 0.05, 0.15]),
  prop('kiss-mark', '💋', ['rightCheek', 0.3, -0.05, 0.22]),
  prop('sweat-drop', '😅', ['top', 0.17, 0.3, 0.1]),
  // Small animals
  prop('fly', '🪰', ['top', 0.24, -0.15, 0.1]),
  prop('mosquito', '🦟', ['rightCheek', 0.25, 0.04, 0.05]),
  prop('spider', '🕷️', ['top', 0.4, 0.65, 0.1]),
  mask('cat', '🐱'), mask('dog', '🐶'), mask('lion', '🦁', 1.35), mask('frog', '🐸'), mask('monkey', '🐵'),
  mask('pig', '🐷'), mask('panda', '🐼'), mask('koala', '🐨'), mask('ghost', '👻', 1.35), mask('disguise', '🥸'),
  { id: 'sunglasses', icon: '🕶️', items: [{ emoji: '🕶️', anchor: 'eyes', scale: 0.8 }] },
  { id: 'glasses', icon: '👓', items: [{ emoji: '👓', anchor: 'eyes', scale: 0.8 }] },
  { id: 'crown', icon: '👑', items: [{ emoji: '👑', anchor: 'top', scale: 0.7, dy: -0.3 }] },
  { id: 'tophat', icon: '🎩', items: [{ emoji: '🎩', anchor: 'top', scale: 0.85, dy: -0.4 }] },
  { id: 'bow', icon: '🎀', items: [{ emoji: '🎀', anchor: 'top', scale: 0.4, dx: -0.35, dy: -0.15 }] },
  { id: 'flower', icon: '🌸', items: [{ emoji: '🌸', anchor: 'rightCheek', scale: 0.4, dx: 0.3, dy: -0.25 }] },
  { id: 'stars', icon: '⭐', items: [{ emoji: '⭐', anchor: 'leftCheek', scale: 0.3 }, { emoji: '⭐', anchor: 'rightCheek', scale: 0.3 }] },
  { id: 'hearts', icon: '❤️', items: [{ emoji: '❤️', anchor: 'leftEye', scale: 0.35 }, { emoji: '❤️', anchor: 'rightEye', scale: 0.35 }] },
  { id: 'tongue', icon: '👅', items: [{ emoji: '👅', anchor: 'mouth', scale: 0.45, dy: 0.12 }] },
  // Fluent Emoji (MIT): more masks and props in a second style, fetched by scripts/fetch-fluent.mjs
  fmask('tiger', '🐯'), fmask('bear', '🐻'), fmask('fox', '🦊'), fmask('cow', '🐮'), fmask('rabbit', '🐰', 1.4), fmask('hamster', '🐹'),
  fmask('unicorn', '🦄', 1.35), fmask('dragon', '🐲', 1.35), fmask('alien', '👽'), fmask('robot', '🤖'), fmask('pumpkin', '🎃'),
  fmask('nerd', '🤓', 1.35), fmask('monocle', '🧐', 1.35), fmask('cowboy', '🤠', 1.45),
  fluent('gradcap', '🎓', [{ emoji: '🎓', anchor: 'top', scale: 0.9, dy: -0.35 }]),
  fluent('sunhat', '👒', [{ emoji: '👒', anchor: 'top', scale: 1.0, dy: -0.35 }]),
  fluent('ribbon', '🎀', [{ emoji: '🎀', anchor: 'top', scale: 0.4, dx: 0.35, dy: -0.15 }]),
  fluent('stars', '🌟', [{ emoji: '🌟', anchor: 'leftCheek', scale: 0.32 }, { emoji: '🌟', anchor: 'rightCheek', scale: 0.32 }]),
  fluent('rainbow', '🌈', [{ emoji: '🌈', anchor: 'top', scale: 1.1, dy: -0.55 }]),
  fluent('butterfly', '🦋', [{ emoji: '🦋', anchor: 'top', scale: 0.4, dx: -0.4, dy: -0.2 }]),
];
// Chips show the real art, not the system emoji font: the kid sees what lands on the face. A prop pack brings its own picture.
export const STICKER_PACKS: StickerPack[] = packs.map((p) => (p.items.length && !p.img ? { ...p, img: emojiFile(p.icon, p.art) } : p));

// Landmark indices (MediaPipe canonical face mesh)
const L_CHEEK = 234, R_CHEEK = 454, TOP = 10, CHIN = 152, LIP_U = 13, LIP_L = 14, NOSE = 4;
const L_IRIS = [468, 469, 470, 471, 472], R_IRIS = [473, 474, 475, 476, 477];

type P = [number, number];
const pt = (lm: Float32Array, i: number): P => [lm[i * 3], lm[i * 3 + 1]];
const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function mean(lm: Float32Array, idx: number[]): P {
  let x = 0, y = 0;
  for (const i of idx) { x += lm[i * 3]; y += lm[i * 3 + 1]; }
  return [x / idx.length, y / idx.length];
}

export function faceSprites(items: Placement[], art: Art | undefined, lm: Float32Array, aspect: number): Sprite[] {
  const lc = pt(lm, L_CHEEK), rc = pt(lm, R_CHEEK), top = pt(lm, TOP), chin = pt(lm, CHIN);
  const le = mean(lm, L_IRIS), re = mean(lm, R_IRIS);
  const width = Math.abs(rc[0] - lc[0]);
  const heightX = Math.abs(chin[1] - top[1]) / aspect;          // face height in x units
  const angle = Math.atan2((re[1] - le[1]) / aspect, re[0] - le[0]); // roll from the eye line, image space
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const anchors: Record<Anchor, P> = {
    face: mid(top, chin),
    eyes: mid(le, re),
    leftEye: le,
    rightEye: re,
    top,
    mouth: mid(pt(lm, LIP_U), pt(lm, LIP_L)),
    nose: pt(lm, NOSE),
    leftCheek: [lc[0] + width * 0.12, lc[1]],
    rightCheek: [rc[0] - width * 0.12, rc[1]],
  };
  return items.map((it) => {
    const [ax, ay] = anchors[it.anchor];
    const dx = (it.dx ?? 0) * width, dy = (it.dy ?? 0) * width;     // offsets in x units, rotated with the head
    const ox = dx * cosA - dy * sinA, oy = dx * sinA + dy * cosA;
    const base = it.anchor === 'face' ? Math.max(width, heightX) : width;
    return { src: 'src' in it ? it.src : emojiFile(it.emoji, art), cx: ax + ox, cy: ay + oy * aspect, size: it.scale * base, angle };
  });
}

export function spritesFor(packId: string, faces: Face[], aspect: number): Sprite[] {
  const pack = STICKER_PACKS.find((p) => p.id === packId);
  if (!pack || pack.items.length === 0 || faces.length === 0) return [];
  return faces.flatMap((f) => faceSprites(pack.items, pack.art, f.landmarks, aspect));
}

// Several packs at once (operator, 2026-09-27). Five is the limit: a sixth pick replaces the oldest.
export const MAX_STICKERS = 5;
const PACK = new Map(STICKER_PACKS.map((p) => [p.id, p]));

// A mask covers the whole face. Props (hat, glasses, stars) sit on one spot.
export function isMask(id: string): boolean {
  const p = PACK.get(id);
  return !!p && p.items.length === 1 && p.items[0].anchor === 'face';
}

// Props combine. A mask replaces the mask that is on: two masks would only cover each other.
export function toggleSticker(active: string[], id: string, max = MAX_STICKERS): string[] {
  if (id === 'none') return [];
  if (!PACK.has(id)) return active;
  if (active.includes(id)) return active.filter((p) => p !== id);
  const kept = isMask(id) ? active.filter((p) => !isMask(p)) : active;
  const next = [...kept, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

// Per face: the mask first, the props on top in the order of the picks. Sprites draw in list order.
export function spritesForAll(active: string[], faces: Face[], aspect: number): Sprite[] {
  if (active.length === 0 || faces.length === 0) return [];
  const packs = active.map((id) => PACK.get(id)).filter((p): p is StickerPack => !!p && p.items.length > 0);
  const ordered = [...packs.filter((p) => isMask(p.id)), ...packs.filter((p) => !isMask(p.id))];
  return faces.flatMap((f) => ordered.flatMap((p) => faceSprites(p.items, p.art, f.landmarks, aspect)));
}
