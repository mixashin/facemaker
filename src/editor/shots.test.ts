import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { turn, shotSize, cardSize } from './shots';

const front = (yaw: number, pitch: number) => new THREE.Vector3(0, 0, 1).applyQuaternion(turn(yaw, pitch));
const top = (yaw: number, pitch: number) => new THREE.Vector3(0, 1, 0).applyQuaternion(turn(yaw, pitch));

describe('turn', () => {
  it('no turn: the front looks at the viewer', () => {
    expect(front(0, 0).toArray()).toEqual([0, 0, 1]);
  });
  it('yaw turns the front to the right of the screen', () => {
    const f = front(Math.PI / 2, 0);
    expect(f.x).toBeCloseTo(1); expect(f.z).toBeCloseTo(0);
    expect(top(Math.PI / 2, 0).y).toBeCloseTo(1); // the prop stays upright
  });
  it('pitch tips the top to the viewer', () => {
    const t = top(0, Math.PI / 4);
    expect(t.z).toBeGreaterThan(0.7); expect(t.y).toBeGreaterThan(0.7); expect(t.x).toBeCloseTo(0);
  });
  it('pitch goes around the line that lies on the screen, whatever the yaw is', () => {
    for (const yaw of [0.3, 1.5, 3, -2]) {
      const t = top(yaw, 0.5);
      expect(t.x).toBeCloseTo(0); expect(t.z).toBeCloseTo(Math.sin(0.5)); expect(t.y).toBeCloseTo(Math.cos(0.5));
    }
  });
});

describe('shotSize', () => {
  it('follows the size of the sticker on the photo in steps, so a pinch does not build a new picture buffer for every frame', () => {
    expect(shotSize(200)).toBe(256);
    expect(shotSize(256)).toBe(256);
    expect(shotSize(257)).toBe(512);
    expect(shotSize(900)).toBe(1024);
  });
  it('holds limits', () => {
    expect(shotSize(3)).toBe(128);
    expect(shotSize(NaN)).toBe(128);
    expect(shotSize(99999)).toBe(1024);
  });
});

describe('cardSize', () => {
  it('the long side of a flat sticker is one unit', () => {
    expect(cardSize(200, 100)).toEqual([1, 0.5]);
    expect(cardSize(100, 200)).toEqual([0.5, 1]);
    expect(cardSize(36, 36)).toEqual([1, 1]);
    expect(cardSize(0, 0)).toEqual([1, 1]); // a picture with no size of its own (some SVG files)
  });
});
