// Background scenes (M4c): the child stands in a place. Art by Astra (request R2 of the brief), CC0.
// A scene is a plate (or a loop video in its place), a far layer that drifts behind the child,
// and a near layer that sways in front of the child.
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
};

// Filled by scripts/import-art.mjs backgrounds, when the art arrives.
export const SCENES: Scene[] = [];

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
