import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spriteTransform, SpriteLayer } from './spriteLayer';

const s = (cx: number, cy: number, size = 0.1, angle = 0) => ({ emoji: '🐱', cx, cy, size, angle });

describe('spriteTransform', () => {
  it('maps the image centre to the origin', () => {
    const t = spriteTransform(s(0.5, 0.5), false, 16 / 9);
    expect(t.x).toBeCloseTo(0, 6); expect(t.y).toBeCloseTo(0, 6);
  });

  it('maps image coords (y down) to the isotropic group space and mirrors x on request', () => {
    // the group scales y by aspect, so the child y is NDC y divided by aspect
    const t = spriteTransform(s(0.25, 0.25), false, 2);
    expect(t.x).toBeCloseTo(-0.5, 6); expect(t.y).toBeCloseTo(0.25, 6);
    const m = spriteTransform(s(0.25, 0.25), true, 2);
    expect(m.x).toBeCloseTo(0.5, 6); expect(m.y).toBeCloseTo(0.25, 6);
  });

  it('scales uniformly so a rotation stays a rotation in pixels', () => {
    const t = spriteTransform(s(0.5, 0.5, 0.1), false, 2);
    expect(t.s).toBeCloseTo(0.2, 6);
    expect('sy' in t).toBe(false);
  });

  it('rotation follows the image-space angle and flips with the mirror', () => {
    expect(spriteTransform(s(0.5, 0.5, 0.1, 0.3), false, 1).rot).toBeCloseTo(-0.3, 6);
    expect(spriteTransform(s(0.5, 0.5, 0.1, 0.3), true, 1).rot).toBeCloseTo(0.3, 6);
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
