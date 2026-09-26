import type { Face } from '../tracking/faceTracker';

export type Anchor = 'face' | 'eyes' | 'leftEye' | 'rightEye' | 'top' | 'mouth' | 'nose' | 'leftCheek' | 'rightCheek';
export type Placement = { emoji: string; anchor: Anchor; scale: number; dx?: number; dy?: number }; // face-width units
export type StickerPack = { id: string; icon: string; items: Placement[] };
export type Sprite = { emoji: string; cx: number; cy: number; size: number; angle: number };

const mask = (id: string, emoji: string, scale = 1.25): StickerPack => ({ id, icon: emoji, items: [{ emoji, anchor: 'face', scale }] });

export const STICKER_PACKS: StickerPack[] = [
  { id: 'none', icon: '🙂', items: [] },
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
];

export function emojiFile(emoji: string): string {
  const cps = [...emoji].map((c) => c.codePointAt(0)!).filter((cp) => cp !== 0xfe0f);
  return `/stickers/${cps.map((cp) => cp.toString(16)).join('-')}.svg`;
}

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

function faceSprites(items: Placement[], lm: Float32Array, aspect: number): Sprite[] {
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
    return { emoji: it.emoji, cx: ax + ox, cy: ay + oy * aspect, size: it.scale * base, angle };
  });
}

export function spritesFor(packId: string, faces: Face[], aspect: number): Sprite[] {
  const pack = STICKER_PACKS.find((p) => p.id === packId);
  if (!pack || pack.items.length === 0 || faces.length === 0) return [];
  return faces.flatMap((f) => faceSprites(pack.items, f.landmarks, aspect));
}
