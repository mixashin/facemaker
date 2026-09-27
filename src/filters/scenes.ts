// Background scenes (M4c): the child stands in a place. Art by Astra (request R2 of the brief), CC0.
// A scene is a plate (or a loop video in its place), a far layer that drifts behind the child,
// a near layer that sways in front of the child, and small bits that float in front of the child.
import list from './scenes.json';
import type { Sprite } from './stickers';

export type Motion = 'rise' | 'fall' | 'drift' | 'twinkle';
// count: how many float at once. size: width of one, as a share of the visible width.
export type Bit = { src: string; motion: Motion; count: number; size: number };
export type Scene = {
  id: string;
  icon: string;
  chip?: string; // small picture for the chip
  plate: string; // opaque picture. With a video: the picture for the time before the video plays
  video?: string; // loop video in place of the plate
  far?: string; // picture with transparency, behind the child
  near?: string; // picture with transparency, in front of the child
  drift?: number; // how far the far layer moves, in scene widths
  sway?: number; // how far the near layer moves
  bits?: Bit[];
};

// What the app adds to the files: an icon and the order of the scenes, and how each kind of bit moves.
// A scene or a bit that is not named here gets the last entry.
const ICONS: [string, string][] = [['underwater', '🐠'], ['grassland', '🌼'], ['spooky', '👻'], ['space', '🚀'], ['snow', '❄️'], ['candy-land', '🍭'], ['clouds', '☁️'], ['', '🏝️']];
const MOVES: [string, Omit<Bit, 'src'>][] = [
  ['bubble', { motion: 'rise', count: 7, size: 0.1 }],
  ['snowflake', { motion: 'fall', count: 9, size: 0.07 }],
  ['candy', { motion: 'fall', count: 5, size: 0.1 }],
  ['leaf', { motion: 'fall', count: 6, size: 0.08 }],
  ['star', { motion: 'twinkle', count: 7, size: 0.08 }],
  ['ghost', { motion: 'drift', count: 2, size: 0.16 }],
  ['cloud', { motion: 'drift', count: 2, size: 0.24 }],
  ['', { motion: 'drift', count: 3, size: 0.11 }], // butterfly, fish, bird
];
const named = <T>(table: [string, T][], name: string): T => (table.find(([n]) => n === name) ?? table[table.length - 1])[1];
const place = (id: string) => { const i = ICONS.findIndex(([n]) => n === id); return i < 0 ? ICONS.length : i; };

type Entry = { id: string; plate: string; chip: string; far?: string; near?: string; video?: string; bits: string[] };
// The list comes from scripts/import-art.mjs backgrounds.
export const SCENES: Scene[] = (list as Entry[])
  .map(({ bits, ...s }): Scene => ({ ...s, icon: named(ICONS, s.id), drift: 0.02, sway: 0.008, bits: bits.map((b) => ({ src: `/scenes/${s.id}/bits/${b}.webp`, ...named(MOVES, b) })) }))
  .sort((a, b) => place(a.id) - place(b.id) || a.id.localeCompare(b.id));

export const BACKDROPS: { id: string; icon: string; img?: string }[] = [{ id: 'none', icon: '🙂' }, ...SCENES.map((s) => ({ id: s.id, icon: s.icon, img: s.chip }))];

export const sceneById = (id: string, extra: Scene | null = null): Scene | null => SCENES.find((s) => s.id === id) ?? (extra && extra.id === id ? extra : null);

// One scene at a time. A tap on the scene that is on turns it off.
export const pickScene = (current: string, id: string): string => (id === current ? 'none' : id);

// How the scene covers the visible part of the stage, as seen from the first render pass.
// Result: scene uv = (canvas uv - 0.5) * fit + 0.5. The front camera view is mirrored in the second pass,
// so the scene is flipped here and reads the right way round on the screen.
export function sceneFit(scale: [number, number], pw: number, ph: number, mirror: boolean): [number, number] {
  return [(mirror ? -2 : 2) / scale[0], ((2 / scale[1]) * pw) / ph];
}

// The part of the camera picture that the screen shows, as shares of the picture (0..1, y down).
export type View = { x0: number; x1: number; y0: number; y1: number };

// A number from 0 to 1 that is always the same for the same bit: no two bubbles take the same path.
function chance(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);

// Where the bits of a scene float at this time. They are drawn like stickers, in front of the child:
// a bubble rises past the face, snow falls over it. The place depends on the time only, so a photo,
// a recording and the screen show the same.
export function bitSprites(scene: Scene | null, tMs: number, aspect: number, view: View): Sprite[] {
  if (!scene?.bits?.length) return [];
  const t = tMs / 1000;
  const w = view.x1 - view.x0, h = view.y1 - view.y0;
  const out: Sprite[] = [];
  scene.bits.forEach((bit, kind) => {
    const size = bit.size * w; // Sprite.size is a share of the picture width
    const my = (size * aspect) / 2 + 0.01, mx = size / 2 + 0.01; // from "just out of view" to "just out of view"
    for (let n = 0; n < bit.count; n++) {
      const i = kind * 31 + n, a = chance(i, 1), b = chance(i, 2), c = chance(i, 3);
      const lane = (n + 0.15 + 0.7 * c) / bit.count; // each bit has its own strip of the picture
      let cx: number, cy: number, s = size, angle = 0;
      if (bit.motion === 'rise' || bit.motion === 'fall') {
        const u = frac(t / (9 + 6 * a) + b);
        cy = bit.motion === 'rise' ? view.y1 + my - u * (h + 2 * my) : view.y0 - my + u * (h + 2 * my);
        cx = view.x0 + w * (lane + 0.04 * Math.sin(TAU * (t / (3 + 2 * a) + b)));
        s = size * (0.7 + 0.6 * c);
        if (bit.motion === 'fall') angle = 0.7 * Math.sin(t * (0.5 + a) + b * TAU);
      } else if (bit.motion === 'drift') {
        const u = frac(t / (16 + 10 * a) + b);
        cx = n % 2 ? view.x1 + mx - u * (w + 2 * mx) : view.x0 - mx + u * (w + 2 * mx);
        cy = view.y0 + h * (0.08 + 0.5 * lane) + h * 0.03 * Math.sin(TAU * (t / 4 + a));
        angle = 0.15 * Math.sin(t * 1.3 + b * TAU);
      } else {
        // twinkle: a fixed place, off the face in the middle
        cx = c; cy = a;
        if (Math.abs(cx - 0.5) <= 0.22 && Math.abs(cy - 0.5) <= 0.3) cx = cx < 0.5 ? cx - 0.24 : cx + 0.24;
        cx = view.x0 + w * Math.min(0.97, Math.max(0.03, cx)); cy = view.y0 + h * Math.min(0.97, Math.max(0.03, cy));
        s = size * (0.75 + 0.25 * Math.sin(TAU * (t / (2 + 2 * b)) + a * TAU));
        angle = 0.2 * Math.sin(t * 0.7 + b * TAU);
      }
      out.push({ src: bit.src, cx, cy, size: s, angle });
    }
  });
  return out;
}
