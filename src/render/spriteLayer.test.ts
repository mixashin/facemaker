import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spriteTransform, SpriteLayer } from './spriteLayer';

const s = (cx: number, cy: number, size = 0.1, angle = 0) => ({ src: '/stickers/1f431.svg', cx, cy, size, angle });

describe('spriteTransform', () => {
  it('maps the image centre to the origin', () => {
    const t = spriteTransform(s(0.5, 0.5), false, 16 / 9);
    expect(t.x).toBeCloseTo(0, 6); expect(t.y).toBeCloseTo(0, 6);
  });

  it('maps image coords (y down) to the isotropic group space', () => {
    // the group scales y by aspect, so the child y is NDC y divided by aspect
    const t = spriteTransform(s(0.25, 0.25), false, 2);
    expect(t.x).toBeCloseTo(-0.5, 6); expect(t.y).toBeCloseTo(0.25, 6);
  });

  it('places the sprite in the camera picture, not on the screen: the mirror does not move it', () => {
    // The picture with its stickers is warped and mirrored as one afterwards (renderer.ts).
    const plain = spriteTransform(s(0.25, 0.25, 0.1, 0.3), false, 2);
    const mirrored = spriteTransform(s(0.25, 0.25, 0.1, 0.3), true, 2);
    expect(mirrored.x).toBeCloseTo(plain.x, 6);
    expect(mirrored.y).toBeCloseTo(plain.y, 6);
    expect(mirrored.rot).toBeCloseTo(plain.rot, 6);
    expect(mirrored.s).toBeCloseTo(plain.s, 6);
  });

  it('flips the art for a mirrored display, so it reads the right way round after the mirror', () => {
    expect(spriteTransform(s(0.5, 0.5), true, 1).flip).toBe(true);
    expect(spriteTransform(s(0.5, 0.5), false, 1).flip).toBe(false);
  });

  it('scales uniformly so a rotation stays a rotation in pixels', () => {
    const t = spriteTransform(s(0.5, 0.5, 0.1), false, 2);
    expect(t.s).toBeCloseTo(0.2, 6);
    expect('sy' in t).toBe(false);
  });

  it('rotation follows the image-space angle', () => {
    expect(spriteTransform(s(0.5, 0.5, 0.1, 0.3), false, 1).rot).toBeCloseTo(-0.3, 6);
  });
});

describe('SpriteLayer group', () => {
  it('stretches the group by the aspect so sprites rotate in isotropic space', () => {
    const scene = new THREE.Scene();
    const layer = new SpriteLayer(scene);
    layer.update([], false, 1.5);
    const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    expect(group).toBeDefined();
    expect(group.scale.y).toBeCloseTo(1.5, 6);
    expect(group.scale.x).toBeCloseTo(1, 6);
  });
});
