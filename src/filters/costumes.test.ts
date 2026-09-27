import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { COSTUMES, partsOf, partById, wornWith, placeParts, lookAfterPick, afterPick } from './costumes';
import { prop3dById } from './props3d';
import { LOOKS, MAKEUP } from './makeup';
import type { Head } from './props3d';

const head = (x: number, width: number, turn = new THREE.Quaternion()): Head => ({ centre: new THREE.Vector3(x, 0.1, -0.3), width, quat: turn });

describe('costumes', () => {
  it('the witch is a painted look with two parts, and every file is on disk', () => {
    const witch = COSTUMES.find((c) => c.id === 'witch')!;
    expect(witch.look).toBe('paint-witch');
    expect(witch.parts.map((p) => p.id)).toEqual(['witch-hat-hair', 'witch-nose']);
    for (const p of witch.parts) expect(existsSync('public' + p.file), p.file).toBe(true);
    for (const p of witch.parts) { expect(p.chip).toBe(`/costumes/witch/${p.id}-chip.webp`); expect(existsSync('public' + p.chip), p.chip).toBe(true); }
    const look = LOOKS.find((l) => l.id === 'paint-witch')!;
    expect(existsSync('public' + look.img), look.img).toBe(true);
    expect(MAKEUP.map((m) => m.id)).toContain('paint-witch'); // one chip in the makeup list
    expect(look.flat).toBeGreaterThan(0.5); // the paint keeps its colour: it must match the nose
    expect(LOOKS.find((l) => l.id === 'paint-tiger')!.flat).toBeUndefined(); // paint with no parts takes the light of the face
  });
  it('finds a part by its name, and no part has the name of a 3D prop', () => {
    expect(partById('witch-nose')?.file).toBe('/costumes/witch/witch-nose.glb');
    expect(partById('crown')).toBeUndefined();
    expect(partById('no-such-part')).toBeUndefined();
    for (const c of COSTUMES) for (const p of c.parts) expect(prop3dById(p.id), p.id).toBeUndefined();
  });
  it('every costume belongs to a look of the makeup list', () => {
    for (const c of COSTUMES) expect(LOOKS.map((l) => l.id), c.id).toContain(c.look);
  });
  it('gives the parts of a look, and none for a look that is paint only', () => {
    expect(partsOf('paint-witch').map((p) => p.id)).toEqual(['witch-hat-hair', 'witch-nose']);
    expect(partsOf('paint-tiger')).toEqual([]);
    expect(partsOf('none')).toEqual([]);
    expect(partsOf('no-such-look')).toEqual([]);
  });
});

describe('wornWith', () => {
  it('the hat of the costume takes the place of the hat that the child chose, the rest stays', () => {
    expect(wornWith(['crown', 'sunglasses', 'bee'], 'paint-witch')).toEqual(['sunglasses', 'bee']);
    expect(wornWith(['bee', 'pirate-hat'], 'paint-witch')).toEqual(['bee']);
  });
  it('changes nothing for a look with no parts', () => {
    expect(wornWith(['crown', 'sunglasses', 'bee'], 'paint-tiger')).toEqual(['crown', 'sunglasses', 'bee']);
    expect(wornWith(['crown'], 'none')).toEqual(['crown']);
  });
});

describe('placeParts', () => {
  const parts = partsOf('paint-witch');
  it('puts every part on every head: at the middle of the head, with its turn, one unit is the face width', () => {
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    const placed = placeParts(parts, [head(-0.4, 0.5), head(0.3, 0.8, turn)]);
    expect(placed.map((p) => `${p.id}#${p.face}`)).toEqual(['witch-hat-hair#0', 'witch-nose#0', 'witch-hat-hair#1', 'witch-nose#1']);
    expect(placed[0]).toMatchObject({ pos: [-0.4, 0.1, -0.3], quat: [0, 0, 0, 1], scale: 0.5, file: '/costumes/witch/witch-hat-hair.glb' });
    expect(placed[3].scale).toBe(0.8);
    expect(new THREE.Quaternion(...placed[3].quat).angleTo(turn)).toBeCloseTo(0);
    expect(placed.every((p) => p.clip === undefined)).toBe(true);
  });
  it('gives nothing with no head or no part', () => {
    expect(placeParts(parts, [])).toEqual([]);
    expect(placeParts([], [head(0, 0.5)])).toEqual([]);
  });
});

describe('lookAfterPick', () => {
  it('a tap on a hat takes the costume off that has a hat of its own: the child sees the hat that it chose', () => {
    expect(lookAfterPick('paint-witch', 'crown')).toBe('none');
    expect(lookAfterPick('paint-witch', 'witch-hat')).toBe('none');
  });
  it('glasses and pests go with the costume', () => {
    expect(lookAfterPick('paint-witch', 'sunglasses')).toBe('paint-witch');
    expect(lookAfterPick('paint-witch', 'bee')).toBe('paint-witch');
    expect(lookAfterPick('paint-witch', 'none')).toBe('paint-witch');
  });
  it('a look with no parts stays', () => {
    expect(lookAfterPick('paint-tiger', 'crown')).toBe('paint-tiger');
    expect(lookAfterPick('none', 'crown')).toBe('none');
  });
});

describe('afterPick: a tap on a chip of the 3D tab', () => {
  it('the hat was chosen before the costume hid it: the tap takes the costume off and the hat shows', () => {
    expect(afterPick('paint-witch', ['crown'], 'crown')).toEqual({ look: 'none', active: ['crown'] });
    expect(afterPick('paint-witch', ['bee', 'crown'], 'crown')).toEqual({ look: 'none', active: ['bee', 'crown'] });
  });
  it('another hat than the chosen one: the costume goes, the new hat takes the place of the old one', () => {
    expect(afterPick('paint-witch', ['crown'], 'pirate-hat')).toEqual({ look: 'none', active: ['pirate-hat'] });
    expect(afterPick('paint-witch', [], 'crown')).toEqual({ look: 'none', active: ['crown'] });
  });
  it('with no costume a second tap takes the hat off, as before', () => {
    expect(afterPick('none', ['crown'], 'crown')).toEqual({ look: 'none', active: [] });
    expect(afterPick('paint-tiger', ['crown'], 'crown')).toEqual({ look: 'paint-tiger', active: [] });
  });
  it('glasses and pests toggle under the costume', () => {
    expect(afterPick('paint-witch', ['bee'], 'bee')).toEqual({ look: 'paint-witch', active: [] });
    expect(afterPick('paint-witch', [], 'sunglasses')).toEqual({ look: 'paint-witch', active: ['sunglasses'] });
  });
});
