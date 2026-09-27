import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BackdropLayer, backdropUniforms } from './backdropLayer';
import type { Scene } from '../filters/scenes';

const sea: Scene = { id: 'sea', icon: '🐟', plate: '/s/plate.webp', far: '/s/far.webp', near: '/s/near.webp', drift: 0.03, sway: 0.01 };
const moon: Scene = { id: 'moon', icon: '🌙', plate: '/m/plate.webp' };
const film: Scene = { id: 'film', icon: '🎬', plate: '/f/plate.webp', video: '/f/loop.mp4' };

function setup() {
  const pending = new Map<string, (img: never) => void>();
  const videos: { src: string; playing: boolean; ready: () => void }[] = [];
  const load = (src: string, done: (img: never) => void) => { pending.set(src, done); };
  const film = (src: string, ready: (el: never) => void) => {
    const v = { src, playing: false, videoWidth: 720, videoHeight: 720, play() { v.playing = true; return Promise.resolve(); }, pause() { v.playing = false; }, removeAttribute() {}, load() {} };
    videos.push({ src, get playing() { return v.playing; }, ready: () => ready(v as never) });
    return v as never;
  };
  const mat = new THREE.ShaderMaterial({ uniforms: backdropUniforms(new THREE.Texture()) });
  const layer = new BackdropLayer(mat, load as never, film as never);
  const arrive = (src: string, width = 1536, height = 1536) => pending.get(src)!({ width, height } as never);
  const u = mat.uniforms;
  const run = (scene: Scene | null, mirror = false, t = 0) => layer.update(scene, mirror, t, [640, 480], [640, 480]);
  return { layer, mat, u, pending, videos, arrive, run };
}
const mask = (v: number, w = 4, h = 3) => new Uint8Array(w * h).fill(v); // 4 x 3, as the canvas of the tests (640 x 480)

describe('BackdropLayer', () => {
  it('no scene, no mask: the camera picture goes through', () => {
    const s = setup();
    s.layer.setMask(mask(255), 4, 3);
    expect(s.run(null)).toBe(false);
    expect(s.u.uOn.value).toBe(0);
  });

  it('waits for the scene and for the first mask', () => {
    const s = setup();
    expect(s.run(moon)).toBe(false);
    expect(s.u.uOn.value).toBe(0);
    s.arrive(moon.plate);
    expect(s.run(moon)).toBe(false); // no mask yet: without it the whole picture would be scene
    s.layer.setMask(mask(255), 4, 3);
    expect(s.run(moon)).toBe(true);
    expect(s.u.uOn.value).toBe(1);
    expect((s.u.uPlate.value as THREE.Texture).image).toMatchObject({ width: 1536 });
  });

  it('forgets the mask when the scene goes off', () => {
    const s = setup();
    s.run(moon); s.arrive(moon.plate); s.layer.setMask(mask(255), 4, 3);
    expect(s.run(moon)).toBe(true);
    s.run(null);
    expect(s.run(moon)).toBe(false); // the mask of the time before is old
    s.layer.setMask(mask(255), 4, 3);
    expect(s.run(moon)).toBe(true);
  });

  it('gives the mask to the shader at its size', () => {
    const s = setup();
    s.layer.setMask(mask(200, 256, 144), 256, 144);
    const tex = s.u.uMask.value as THREE.DataTexture;
    expect(tex.image.width).toBe(256); expect(tex.image.height).toBe(144);
    expect((tex.image.data as Uint8Array)[0]).toBe(200);
    expect((s.u.uTexel.value as THREE.Vector2).toArray()).toEqual([1 / 256, 1 / 144]);
    s.layer.setMask(mask(90, 144, 256), 144, 256); // the phone was turned
    const turned = s.u.uMask.value as THREE.DataTexture;
    expect(turned.image.width).toBe(144);
    expect((turned.image.data as Uint8Array)[0]).toBe(90);
  });

  it('forgets the mask when the page rests: the child comes back in another pose', () => {
    const s = setup();
    s.run(moon); s.arrive(moon.plate); s.layer.setMask(mask(255), 4, 3);
    expect(s.run(moon)).toBe(true);
    s.layer.rest();
    expect(s.run(moon)).toBe(false);
    expect(s.u.uOn.value).toBe(0);
    s.layer.setMask(mask(255), 4, 3);
    expect(s.run(moon)).toBe(true);
  });

  it('does not stretch a mask of the old shape over a turned picture', () => {
    const s = setup();
    s.run(moon); s.arrive(moon.plate); s.layer.setMask(mask(255, 256, 192), 256, 192);
    expect(s.layer.update(moon, false, 0, [640, 480], [640, 480])).toBe(true);
    expect(s.layer.update(moon, false, 0, [480, 640], [480, 640])).toBe(false); // the phone was turned, the mask is from before
    s.layer.setMask(mask(255, 192, 256), 192, 256);
    expect(s.layer.update(moon, false, 0, [480, 640], [480, 640])).toBe(true);
  });

  it('uses the layers that the scene has', () => {
    const s = setup();
    s.layer.setMask(mask(255), 4, 3);
    s.run(sea); s.arrive(sea.plate);
    expect(s.run(sea)).toBe(true); // the plate is enough to start
    expect(s.u.uHasFar.value).toBe(0); expect(s.u.uHasNear.value).toBe(0);
    s.arrive(sea.far!); s.arrive(sea.near!);
    s.run(sea);
    expect(s.u.uHasFar.value).toBe(1); expect(s.u.uHasNear.value).toBe(1);
    expect(s.u.uDrift.value).toBe(0.03); expect(s.u.uSway.value).toBe(0.01);
    s.run(moon); s.arrive(moon.plate); s.run(moon);
    expect(s.u.uHasFar.value).toBe(0); expect(s.u.uHasNear.value).toBe(0);
  });

  it('moves with the time and flips for the front camera', () => {
    const s = setup();
    s.layer.setMask(mask(255), 4, 3);
    s.run(moon); s.arrive(moon.plate);
    s.run(moon, false, 2500);
    expect(s.u.uTime.value).toBeCloseTo(2.5);
    const plain = (s.u.uFit.value as THREE.Vector2).x;
    s.run(moon, true, 2500);
    expect((s.u.uFit.value as THREE.Vector2).x).toBeCloseTo(-plain);
  });

  it('plays a loop video only while its scene is on', () => {
    const s = setup();
    s.layer.setMask(mask(255), 4, 3);
    s.run(film); s.arrive(film.plate);
    expect(s.run(film)).toBe(true); // the plate shows until the video is ready
    expect(s.videos).toHaveLength(1);
    expect(s.videos[0].playing).toBe(true); // play starts the load: a phone on mobile data loads nothing before that
    expect((s.u.uPlate.value as THREE.Texture).image).toMatchObject({ width: 1536 });
    s.videos[0].ready();
    s.run(film);
    expect(s.videos[0].playing).toBe(true);
    expect((s.u.uPlate.value as THREE.Texture).image).toMatchObject({ videoWidth: 720 });
    s.run(null);
    expect(s.videos[0].playing).toBe(false);
    s.layer.setMask(mask(255), 4, 3);
    s.run(film);
    expect(s.videos).toHaveLength(1); // made once
    expect(s.videos[0].playing).toBe(true);
  });

  it('stops the video on dispose', () => {
    const s = setup();
    s.layer.setMask(mask(255), 4, 3);
    s.run(film); s.arrive(film.plate); s.run(film); s.videos[0].ready(); s.run(film);
    s.layer.dispose();
    expect(s.videos[0].playing).toBe(false);
  });
});
