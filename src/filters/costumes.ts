// A costume (operator, 2026-09-27): one chip in the makeup list that puts on face paint and 3D parts at once.
// The first one is the witch: paint, a hat with hair, a nose with a wart. Art by Astra (CC0, brief R7), imported
// by scripts/import-art.mjs costumes.
//
// A part is made around a head (template astra/templates/head-standin.obj). It is in the head frame: its origin
// is the middle of the head between the sides of the face, one unit is the face width, x right, y up, z out of
// the face. So a part needs no rule for its place: it goes where the head is, with the turn and the size of
// the head.
import list from './costumes.json';
import { prop3dById, toggleProp, type Head, type Kind, type Placed } from './props3d';

export type Part = { id: string; file: string; takes?: Kind };
export type Costume = { id: string; look: string; parts: Part[] };

// What a part takes the place of: with the hat of the witch on, a hat of the child's choice has no room
const TAKES: Record<string, Kind> = { 'witch-hat-hair': 'hat' };

export const COSTUMES: Costume[] = (list as { id: string; look: string; parts: { id: string; file: string }[] }[])
  .map((c) => ({ id: c.id, look: c.look, parts: c.parts.map((p) => ({ id: p.id, file: p.file, takes: TAKES[p.id] })) }));
const BY_LOOK = new Map(COSTUMES.map((c) => [c.look, c.parts]));

export const partsOf = (look: string): Part[] => BY_LOOK.get(look) ?? [];

// The 3D props of the child's choice that show together with a look
export function wornWith(active: string[], look: string): string[] {
  const taken = new Set(partsOf(look).flatMap((p) => (p.takes ? [p.takes] : [])));
  return taken.size ? active.filter((id) => { const kind = prop3dById(id)?.kind; return !kind || !taken.has(kind); }) : active;
}

// The look after a tap on a 3D prop. A costume with a hat of its own hides a chosen hat: the chip would light
// and nothing would change. So a tap on a hat takes such a costume off.
export function lookAfterPick(look: string, prop: string): string {
  const kind = prop3dById(prop)?.kind;
  return kind && partsOf(look).some((p) => p.takes === kind) ? 'none' : look;
}

// A tap on a chip of the 3D tab: the look and the chosen props after it. A hat that was chosen before the
// costume hid it has a lit chip. A tap on that chip takes the costume off and keeps the hat: a plain toggle
// took both off, and the child saw no hat and no costume.
export function afterPick(look: string, active: string[], prop: string): { look: string; active: string[] } {
  const next = lookAfterPick(look, prop);
  return { look: next, active: next !== look && active.includes(prop) ? active : toggleProp(active, prop) };
}

export function placeParts(parts: Part[], heads: Head[]): Placed[] {
  return heads.flatMap((h, face) => parts.map((p) => ({ id: p.id, face, file: p.file, pos: h.centre.toArray(), quat: h.quat.toArray() as Placed['quat'], scale: h.width })));
}
