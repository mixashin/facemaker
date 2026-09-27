# M4b Face On A Picture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A picture (orange, apple, cat, dog, lion, or a photo from the device) fills the screen and carries the child's live eyes and mouth, which move, talk, and obey the face filters.

**Architecture:** The first render pass stays as it is (camera picture, makeup, stickers into a texture). In face-on mode the second pass draws the target picture instead of the warped camera picture, and on it one quad that shows the live face in face units (origin at the nose tip, one unit is the face width, roll removed). Three soft ellipses, placed on the eyes and the mouth, cut the quad down to eyes and mouth. The quad reads the first-pass texture through the same handle chain as the warp shader, so every filter works. The ellipses follow the filters through a forward map of the landmark rings (`unwarpPoint`).

**Tech Stack:** Three.js 0.186 (ShaderMaterial, shared uniforms), MediaPipe FaceLandmarker (IMAGE mode for the device photo), Preact signals, Vitest (node), Playwright smoke, ffmpeg (art import, by hand).

**Spec:** `docs/SPEC.md`, section "M4", part "M4b Face on a picture". Art: `astra/BRIEF.md` request R1 (not in git), delivered and checked 2026-09-27.

## Global Constraints

- Zero third-party requests at runtime. Pictures are served from the app origin. A device photo never leaves the device: object URL, local detection.
- Works offline after the first load: target pictures are in the precache.
- Licences allowed: MIT, Apache-2.0, BSD, MPL-2.0, Unlicense, CC0, CC-BY. Astra's art is CC0, released by the operator.
- Eyes and mouth only, on every target (operator, 2026-09-27).
- Kid UI: icons, 64 px tap targets, no reading required. Serbian (Latin) and English strings for every new key.
- Colour: shader materials copy values as they are. No colour space on textures that feed them.
- The refactor of the warp shader must not change one pixel: compare with the live build (`ffmpeg -lavfi psnr`, expected `inf`).
- Commit messages: plain conventional commits. No `Co-Authored-By`, no "Generated with".
- Every commit is gated on the vitest exit code.
- Operator photos in `test/` and the folder `astra/` are never committed.

## Review Focus

1. **No face in the camera picture.** Expected: the target picture shows without eyes and mouth, no stale patch, no crash. Test in Task 4 (`hides the face without a frame`).
2. **The picture is not loaded yet, or fails to load.** Expected: the camera view stays until the picture is ready. Test in Task 4 (`reports not ready until the picture is loaded`).
3. **Tilted head, face near or far.** Expected: eyes and mouth stay level and keep their size on the target. Test in Task 2 (`face units do not change with roll, place or size`).
4. **A filter that moves the whole face (big head).** Expected: the windows follow the eyes. Test in Task 2 (`windows follow a filter`).
5. **Device photo with no face, or a huge photo.** Expected: the photo shows with eyes and mouth in the middle, the texture is at most 1536 px. Test in Task 6 (`photo without a face gets the middle`, `limits the size of a device photo`).

## File Structure

| File | Responsibility |
|---|---|
| `src/filters/warpMath.ts` (new) | `warpPoint` (the shader chain in TypeScript) and `unwarpPoint` (its reverse). Pure. |
| `src/render/warpChain.glsl` (new) | Uniforms and `vec2 warp(vec2)`. Shared by `warp.frag` and `faceon.frag`. |
| `src/filters/faceon.ts` (new) | Face frame, face units, windows, target list, cover fit, target from a photo. Pure. |
| `src/render/faceon.frag`, `src/render/faceOnLayer.ts` (new) | The picture and the face quad in the second pass. |
| `scripts/import-art.mjs` (new) | Astra's PNG files to app files (WebP). Runs by hand. |
| `public/targets/*.webp` (new, committed) | Five pictures, five chips. |
| `src/tracking/*` | One-shot detection on a still picture. |
| `src/app/FaceOnPanel.tsx` (new), `state.ts`, `Dock.tsx`, `App.tsx` | Tab, chips, file picker, loop. |

---

### Task 1: Warp maths and the shared shader chain

**Files:**
- Create: `src/filters/warpMath.ts`, `src/filters/warpMath.test.ts`, `src/render/warpChain.glsl`
- Modify: `src/render/warp.frag`, `src/render/renderer.ts`, `src/filters/presets.test.ts:197`

**Interfaces:**
- Consumes: `Handle` from `src/filters/presets.ts`.
- Produces: `warpPoint(screen: [number, number], handles: Handle[], aspect: number): [number, number]`, `unwarpPoint(picture: [number, number], handles: Handle[], aspect: number): [number, number]`. GLSL: `vec2 warp(vec2 uv)` plus the uniforms `uTex, uAspect, uMirror, uCount, uHandle, uType` and the varying `vUv`.

- [ ] **Step 1: Write the failing test** `src/filters/warpMath.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { warpPoint, unwarpPoint } from './warpMath';
import type { Handle } from './presets';

const A = 4 / 3;
const big: Handle = { cx: 0.5, cy: 0.5, r: 0.3, strength: 0.6, type: 0 };
const small: Handle = { cx: 0.4, cy: 0.45, r: 0.2, strength: -0.9, type: 0 };
const swirl: Handle = { cx: 0.55, cy: 0.5, r: 0.25, strength: 1.2, type: 1 };
const flip: Handle = { cx: 0.5, cy: 0.5, r: 0.3, strength: Math.PI, type: 2 };
const near = (a: [number, number], b: [number, number]) => { expect(a[0]).toBeCloseTo(b[0], 4); expect(a[1]).toBeCloseTo(b[1], 4); };

describe('warpPoint', () => {
  it('leaves a point outside every handle where it is', () => {
    near(warpPoint([0.05, 0.05], [big, swirl], A), [0.05, 0.05]);
  });
  it('reads closer to the centre under a magnifier', () => {
    const [x] = warpPoint([0.6, 0.5], [big], A);
    expect(x).toBeGreaterThan(0.5); expect(x).toBeLessThan(0.6);
  });
  it('measures the radius in x units on both axes', () => {
    // 0.2 below the centre is 0.2 / A in x units: inside r 0.3. 0.35 to the right is outside.
    expect(warpPoint([0.5, 0.7], [big], A)[1]).not.toBeCloseTo(0.7, 4);
    near(warpPoint([0.85, 0.5], [big], A), [0.85, 0.5]);
  });
});

describe('unwarpPoint', () => {
  it('is the reverse of warpPoint for every handle type and for a chain', () => {
    const sets = [[big], [small], [swirl], [flip], [big, small, swirl], [flip, big]];
    for (const hs of sets) for (let i = 0; i < 40; i++) {
      const p: [number, number] = [0.2 + ((i * 37) % 60) / 100, 0.2 + ((i * 53) % 60) / 100];
      near(warpPoint(unwarpPoint(p, hs, A), hs, A), p);
    }
  });
  it('moves a point outward under a magnifier: the eye shows farther from the centre', () => {
    const [x] = unwarpPoint([0.56, 0.5], [big], A);
    expect(x).toBeGreaterThan(0.56);
  });
  it('does nothing without handles', () => {
    near(unwarpPoint([0.3, 0.7], [], A), [0.3, 0.7]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './warpMath'`)

- [ ] **Step 3: Write** `src/filters/warpMath.ts`

```ts
// The handle chain of the warp shader (src/render/warpChain.glsl) in TypeScript, and its reverse.
// The shader asks: which point of the picture shows at this point of the screen (warpPoint).
// Face-on mode asks the reverse: where on the screen does this landmark show (unwarpPoint).
import type { Handle } from './presets';

type P = [number, number];
const bump = (t: number) => { const f = 1 - t * t; return f * f; };
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angle = (h: Handle, t: number) => (h.type === 1 ? h.strength * bump(t) : h.strength * (1 - smoothstep(0.7, 1, t)));

function turn(h: Handle, dx: number, dy: number, a: number, aspect: number): P {
  const s = Math.sin(a), c = Math.cos(a);
  return [h.cx + c * dx - s * dy, h.cy + (s * dx + c * dy) * aspect];
}

function pull(p: P, h: Handle, aspect: number): P {
  const dx = p[0] - h.cx, dy = (p[1] - h.cy) / aspect; // x units on both axes
  const dist = Math.hypot(dx, dy);
  if (dist >= h.r || h.r <= 0) return p;
  if (h.type !== 0) return turn(h, dx, dy, angle(h, dist / h.r), aspect);
  const k = 1 - h.strength * bump(dist / h.r);
  return [h.cx + dx * k, h.cy + dy * k * aspect];
}

function push(p: P, h: Handle, aspect: number): P {
  const dx = p[0] - h.cx, dy = (p[1] - h.cy) / aspect;
  const dist = Math.hypot(dx, dy);
  if (dist >= h.r || h.r <= 0 || dist === 0) return p;
  if (h.type !== 0) return turn(h, dx, dy, -angle(h, dist / h.r), aspect); // a turn keeps the distance
  // pull moves a point at distance x to x * (1 - strength * bump(x / r)). That map rises from 0 to r: bisect.
  let lo = 0, hi = h.r;
  for (let i = 0; i < 24; i++) { const x = (lo + hi) / 2; if (x * (1 - h.strength * bump(x / h.r)) < dist) lo = x; else hi = x; }
  const k = (lo + hi) / 2 / dist;
  return [h.cx + dx * k, h.cy + dy * k * aspect];
}

export const warpPoint = (screen: P, handles: Handle[], aspect: number): P => handles.reduce((p, h) => pull(p, h, aspect), screen);
export const unwarpPoint = (picture: P, handles: Handle[], aspect: number): P => handles.reduceRight((p, h) => push(p, h, aspect), picture);
```

- [ ] **Step 4: Run the test, expect PASS**

- [ ] **Step 5: Share the chain between shaders.** Create `src/render/warpChain.glsl`:

```glsl
precision highp float;
#define MAX_H 32
uniform sampler2D uTex;
uniform float uAspect;        // width / height of the video
uniform bool uMirror;
uniform int uCount;
uniform vec4 uHandle[MAX_H];  // cx, cy, r, strength (normalized video coords, r in x units)
uniform float uType[MAX_H];   // 0 scale, 1 swirl, 2 flip
varying vec2 vUv;

// Which point of the picture shows at this point of the screen. Picture space: y down, same as the landmarks.
// src/filters/warpMath.ts holds the same chain in TypeScript (a test compares the two by hand-made cases).
vec2 warp(vec2 uv) {
  for (int i = 0; i < MAX_H; i++) {
    if (i >= uCount) break;
    vec4 h = uHandle[i];
    vec2 c = h.xy;
    vec2 d = uv - c;
    vec2 da = vec2(d.x, d.y / uAspect);          // isotropic distance in x units
    float dist = length(da);
    float r = h.z;
    if (dist >= r || r <= 0.0) continue;
    float t = dist / r;
    float f = (1.0 - t * t);
    f = f * f;                                    // flat at centre and rim, no folding
    if (uType[i] < 0.5) {
      // scale: strength>0 samples closer to centre (magnify), <0 samples farther (shrink)
      uv = c + d * (1.0 - h.w * f);
    } else {
      // 1 swirl: angle grows toward the centre. 2 flip: constant angle inside, feathered over the outer 30 %.
      float ang = uType[i] < 1.5 ? h.w * f : h.w * (1.0 - smoothstep(0.7, 1.0, t));
      float s = sin(ang), co = cos(ang);
      vec2 rot = vec2(co * da.x - s * da.y, s * da.x + co * da.y);
      uv = c + vec2(rot.x, rot.y * uAspect);
    }
  }
  return clamp(uv, 0.0, 1.0);
}
```

Replace `src/render/warp.frag` with:

```glsl
// Needs warpChain.glsl in front (renderer.ts joins the two).
void main() {
  // Work in unmirrored video space. Flip the *display* only.
  vec2 uv = uMirror ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  uv.y = 1.0 - uv.y;                             // image space: y down, same as the landmarks
  uv = warp(uv);
  gl_FragColor = texture2D(uTex, vec2(uv.x, 1.0 - uv.y)); // back to texture space (flipY)
}
```

`src/render/renderer.ts`: `import chain from './warpChain.glsl?raw';` and `fragmentShader: chain + frag,`.

`src/filters/presets.test.ts` line 197: read `src/render/warpChain.glsl` instead of `src/render/warp.frag`.

- [ ] **Step 6: Prove that no pixel changed.** Build, serve, take `none`, `bigHead`, `upsideDown`, `swirl` with the dock closed from the live site (old smoke script from `main`) and from the new build, compare each pair with `ffmpeg -lavfi psnr`. Expected: `inf` four times.

- [ ] **Step 7: Commit** `feat: warp maths in TypeScript with its reverse, shared shader chain`

---

### Task 2: Face-on geometry and targets

**Files:**
- Create: `src/filters/faceon.ts`, `src/filters/faceon.test.ts`

**Interfaces:**
- Consumes: `unwarpPoint` (Task 1), rings `EYE_R`, `EYE_L`, `LIPS` from `src/filters/makeup.ts`, `coverCrop` from `src/capture/snapshot.ts`.
- Produces:

```ts
export type Frame = { nose: [number, number]; width: number; roll: number };
export type Win = [number, number, number, number];            // cx, cy, rx, ry in face units
export type Target = { id: string; icon: string; img: string; chip?: string; nose: [number, number]; width: number; angle: number };
export const SPAN: number;                                       // face widths that the quad shows
export const TARGETS: Target[];
export const FACEON: { id: string; icon: string; img?: string }[]; // chips: none, the targets, photo
export function faceFrame(lm: Float32Array, aspect: number): Frame;
export function toFace(p: [number, number], f: Frame, aspect: number): [number, number];
export function windows(lm: Float32Array, handles: Handle[], aspect: number): Win[];
export function coverScale(cw: number, ch: number, ew: number, eh: number, pw: number, ph: number): [number, number];
export function pickTarget(current: string, id: string): string;
export function photoTarget(img: string, lm: Float32Array | null, pw: number, ph: number): Target;
export function fitSize(w: number, h: number, max?: number): [number, number];
```

- [ ] **Step 1: Write the failing test** `src/filters/faceon.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { faceFrame, toFace, windows, coverScale, pickTarget, photoTarget, fitSize, TARGETS, FACEON, SPAN, type Frame } from './faceon';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { UV } from '../render/faceMesh';
import type { Handle } from './presets';

const A = 4 / 3;
// A face from the flat layout: centre (cx, cy), width w in x units, rolled by roll.
function face(cx = 0.5, cy = 0.5, w = 0.3, roll = 0): Float32Array {
  const lm = new Float32Array(478 * 3);
  const c = Math.cos(roll), s = Math.sin(roll);
  for (let i = 0; i < 468; i++) {
    const x = (UV[i * 2] - 0.5) * w, y = (0.5 - UV[i * 2 + 1]) * w;
    lm[i * 3] = cx + c * x - s * y;
    lm[i * 3 + 1] = cy + (s * x + c * y) * A;
  }
  return lm;
}
const mid = (ring: number[], lm: Float32Array, f: Frame) => {
  const q = ring.map((i) => toFace([lm[i * 3], lm[i * 3 + 1]], f, A));
  return [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length];
};

describe('face frame', () => {
  it('finds nose, width and roll', () => {
    const f = faceFrame(face(0.4, 0.6, 0.3, 0.2), A);
    expect(f.width).toBeCloseTo(0.3 * (UV[454 * 2] - UV[234 * 2]), 3);
    expect(f.roll).toBeCloseTo(0.2, 3);
    expect(f.nose[0]).toBeGreaterThan(0.35); expect(f.nose[0]).toBeLessThan(0.45);
  });
  it('face units do not change with roll, place or size', () => {
    const a = face(0.5, 0.5, 0.3, 0), b = face(0.3, 0.7, 0.18, -0.4);
    const fa = faceFrame(a, A), fb = faceFrame(b, A);
    for (const ring of [EYE_R, EYE_L, LIPS]) {
      const [ax, ay] = mid(ring, a, fa), [bx, by] = mid(ring, b, fb);
      expect(bx).toBeCloseTo(ax, 3); expect(by).toBeCloseTo(ay, 3);
    }
    expect(toFace(fa.nose, fa, A)).toEqual([0, 0]);
  });
});

describe('windows', () => {
  it('gives three windows: two eyes above the nose, the mouth below, all inside the quad', () => {
    const w = windows(face(), [], A);
    expect(w).toHaveLength(3);
    expect(w[0][0]).toBeLessThan(0); expect(w[1][0]).toBeGreaterThan(0);
    expect(w[0][1]).toBeLessThan(0); expect(w[1][1]).toBeLessThan(0); expect(w[2][1]).toBeGreaterThan(0);
    for (const [cx, cy, rx, ry] of w) {
      expect(rx).toBeGreaterThan(0); expect(ry).toBeGreaterThan(0);
      expect(Math.abs(cx) + rx).toBeLessThan(SPAN / 2); expect(Math.abs(cy) + ry).toBeLessThan(SPAN / 2);
    }
  });
  it('windows follow a filter: a magnifier on the head moves the eyes apart and makes them bigger', () => {
    const lm = face();
    const f = faceFrame(lm, A);
    const head: Handle = { cx: f.nose[0], cy: f.nose[1], r: 0.3, strength: 0.4, type: 0 };
    const plain = windows(lm, [], A), bigHead = windows(lm, [head], A);
    expect(bigHead[0][0]).toBeLessThan(plain[0][0]);
    expect(bigHead[1][0]).toBeGreaterThan(plain[1][0]);
    expect(bigHead[0][2]).toBeGreaterThan(plain[0][2]);
  });
  it('the mouth window grows when the mouth opens', () => {
    const shut = face(), open = face();
    for (const i of [17, 84, 181, 314, 405, 14, 87, 317]) open[i * 3 + 1] += 0.05; // lower lip down
    expect(windows(open, [], A)[2][3]).toBeGreaterThan(windows(shut, [], A)[2][3]);
  });
});

describe('cover fit', () => {
  it('fills the visible part of the stage with the picture, the unit is the picture width', () => {
    // canvas 640 x 480 on a tall screen 380 x 860: the screen shows a column 212 px wide and 480 high
    const [sx, sy] = coverScale(640, 480, 380, 860, 1280, 1280);
    expect((sx * 640) / 2).toBeCloseTo(480, 0); // the square picture is 480 canvas pixels wide: it covers the height
    expect((sy * 480) / 2).toBeCloseTo(480, 0); // and the same on y: pixels stay square
  });
  it('covers a wide view with a tall photo', () => {
    const [sx] = coverScale(1280, 720, 1280, 720, 600, 1200);
    expect((sx * 1280) / 2).toBeCloseTo(1280, 0); // width decides
  });
});

describe('targets', () => {
  it('have a picture and a chip on disk, and a face place inside the picture', () => {
    expect(TARGETS.map((t) => t.id)).toEqual(['orange', 'apple', 'cat', 'dog', 'lion']);
    for (const t of TARGETS) {
      expect(existsSync('public' + t.img), t.img).toBe(true);
      expect(existsSync('public' + t.chip), t.chip).toBe(true);
      expect(t.nose[0]).toBeGreaterThan(0.3); expect(t.nose[0]).toBeLessThan(0.7);
      expect(t.width).toBeGreaterThan(0.2); expect(t.width).toBeLessThan(0.6);
    }
    expect(FACEON[0].id).toBe('none');
    expect(FACEON.at(-1)!.id).toBe('photo');
  });
  it('a second tap turns the target off, a tap on photo always asks for a photo', () => {
    expect(pickTarget('none', 'cat')).toBe('cat');
    expect(pickTarget('cat', 'cat')).toBe('none');
    expect(pickTarget('cat', 'dog')).toBe('dog');
    expect(pickTarget('photo', 'photo')).toBe('photo');
  });
});

describe('device photo', () => {
  it('takes the place of eyes and mouth from the face in the photo', () => {
    const t = photoTarget('blob:x', face(0.4, 0.45, 0.3, 0.1), 1200, 900); // same aspect as A
    expect(t.id).toBe('photo');
    expect(t.nose[0]).toBeCloseTo(faceFrame(face(0.4, 0.45, 0.3, 0.1), A).nose[0], 4);
    expect(t.angle).toBeCloseTo(0.1, 3);
    expect(t.width).toBeGreaterThan(0.2);
  });
  it('photo without a face gets the middle', () => {
    const t = photoTarget('blob:x', null, 1200, 900);
    expect(t.nose).toEqual([0.5, 0.5]);
    expect(t.angle).toBe(0);
  });
  it('limits the size of a device photo', () => {
    expect(fitSize(4000, 3000)).toEqual([1536, 1152]);
    expect(fitSize(3000, 4000)).toEqual([1152, 1536]);
    expect(fitSize(800, 600)).toEqual([800, 600]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

- [ ] **Step 3: Write** `src/filters/faceon.ts`

```ts
// Face on a picture (M4b): the live eyes and mouth on an orange, a cat, or a photo.
// Face units: origin at the nose tip, x along the line between the cheeks, y down, 1 = face width.
import type { Handle } from './presets';
import { EYE_R, EYE_L, LIPS } from './makeup';
import { unwarpPoint } from './warpMath';
import { coverCrop } from '../capture/snapshot';

type P = [number, number];
export type Frame = { nose: P; width: number; roll: number }; // in the camera picture. width in x units, roll in radians
export type Win = [number, number, number, number]; // cx, cy, rx, ry in face units
// nose and width are fractions of the picture width and height. angle: roll of the face place, radians.
export type Target = { id: string; icon: string; img: string; chip?: string; nose: P; width: number; angle: number };

const NOSE = 4, SIDE_R = 234, SIDE_L = 454;
export const SPAN = 1.6; // the face quad shows this many face widths

export function faceFrame(lm: Float32Array, aspect: number): Frame {
  const dx = lm[SIDE_L * 3] - lm[SIDE_R * 3], dy = (lm[SIDE_L * 3 + 1] - lm[SIDE_R * 3 + 1]) / aspect;
  return { nose: [lm[NOSE * 3], lm[NOSE * 3 + 1]], width: Math.hypot(dx, dy), roll: Math.atan2(dy, dx) };
}

export function toFace(p: P, f: Frame, aspect: number): P {
  const dx = (p[0] - f.nose[0]) / f.width, dy = (p[1] - f.nose[1]) / aspect / f.width;
  const c = Math.cos(f.roll), s = Math.sin(f.roll);
  return [c * dx + s * dy + 0, -s * dx + c * dy + 0]; // + 0: no negative zero
}

// Room around the ring (x, y) and the smallest window, per window: right eye, left eye, mouth.
const ROOM: P[] = [[1.35, 2], [1.35, 2], [1.2, 1.35]];
const LEAST: P[] = [[0.1, 0.06], [0.1, 0.06], [0.16, 0.06]];

// Where eyes and mouth show after the filters, in face units. The shader cuts the face quad down to these.
export function windows(lm: Float32Array, handles: Handle[], aspect: number): Win[] {
  const f = faceFrame(lm, aspect);
  return [EYE_R, EYE_L, LIPS].map((ring, n): Win => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of ring) {
      const [x, y] = toFace(unwarpPoint([lm[i * 3], lm[i * 3 + 1]], handles, aspect), f, aspect);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(LEAST[n][0], ((x1 - x0) / 2) * ROOM[n][0]), Math.max(LEAST[n][1], ((y1 - y0) / 2) * ROOM[n][1])];
  });
}

// The picture covers the visible part of the stage. Result: scale of the picture group in clip space.
// One unit in that group is the picture width on both axes, so a turn there is a turn in pixels.
export function coverScale(cw: number, ch: number, ew: number, eh: number, pw: number, ph: number): P {
  const v = coverCrop(cw, ch, ew, eh);
  const k = Math.max(v.w / pw, v.h / ph); // canvas pixels per picture pixel
  return [(2 * pw * k) / cw, (2 * pw * k) / ch];
}

const art = (id: string, icon: string, nose: P, width: number): Target => ({ id, icon, img: `/targets/${id}.webp`, chip: `/targets/${id}-chip.webp`, nose, width, angle: 0 });
// Art by Astra (CC0). The place of the face is set by hand: the face model finds human faces only.
export const TARGETS: Target[] = [
  art('orange', '🍊', [0.5, 0.53], 0.42),
  art('apple', '🍎', [0.5, 0.53], 0.42),
  art('cat', '🐱', [0.497, 0.542], 0.4),
  art('dog', '🐶', [0.5, 0.5], 0.4),
  art('lion', '🦁', [0.497, 0.523], 0.4),
];
export const FACEON: { id: string; icon: string; img?: string }[] = [{ id: 'none', icon: '🙂' }, ...TARGETS.map((t) => ({ id: t.id, icon: t.icon, img: t.chip })), { id: 'photo', icon: '📷' }];

export const pickTarget = (current: string, id: string): string => (id === current && id !== 'photo' ? 'none' : id);

// A photo from the device. With a face in it, the live eyes and mouth go on that face.
export function photoTarget(img: string, lm: Float32Array | null, pw: number, ph: number): Target {
  if (!lm) return { id: 'photo', icon: '📷', img, nose: [0.5, 0.5], width: 0.4, angle: 0 };
  const f = faceFrame(lm, pw / ph);
  return { id: 'photo', icon: '📷', img, nose: f.nose, width: f.width, angle: f.roll };
}

export function fitSize(w: number, h: number, max = 1536): P {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}
```

- [ ] **Step 4:** The `targets` test needs the files of Task 3. Run the other tests now (`npx vitest run src/filters/faceon.test.ts -t "face frame|windows|cover fit|device photo"`), expect PASS. Commit after Task 3.

---

### Task 3: Import the art

**Files:**
- Create: `scripts/import-art.mjs`, `public/targets/{orange,apple,cat,dog,lion}.webp`, `public/targets/{...}-chip.webp`
- Modify: `vite.config.ts` (precache `webp`), `scripts/attributions.mjs`, `src/about/attributions.json`, `src/about/attributions.test.ts`, `LICENSE-ASSETS.md`

- [ ] **Step 1: Write** `scripts/import-art.mjs`

```js
// Art from Astra (astra/out, not in git) to app files. Runs by hand after a delivery: node scripts/import-art.mjs targets
// Needs ffmpeg and ffprobe on PATH. The results are committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const probe = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', file]).toString().trim().split(',');
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

const JOBS = {
  // Face-on targets (brief R1): square, opaque. The generator made 1254 px, so 1280 px keeps every detail.
  targets() {
    const src = 'astra/out/R1-face-targets', dst = 'public/targets';
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src).filter((n) => /^[a-z0-9-]+\.png$/.test(n))) {
      const [w, h, fmt] = probe(`${src}/${f}`);
      if (w !== h || Number(w) < 1254) throw new Error(`${f}: ${w}x${h}, expected a square of 1254 px or more`);
      if (/a/.test(fmt.replace('gray', ''))) throw new Error(`${f}: ${fmt} has transparency, expected an opaque picture`);
      const id = f.replace(/\.png$/, '');
      ffmpeg('-i', `${src}/${f}`, '-vf', 'scale=1280:1280:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', `${dst}/${id}.webp`);
      ffmpeg('-i', `${src}/${f}`, '-vf', 'crop=iw*0.56:ih*0.56,scale=128:128:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', `${dst}/${id}-chip.webp`);
      console.log('imported', id);
    }
  },
};

const job = JOBS[process.argv[2]];
if (!job) { console.error('usage: node scripts/import-art.mjs', Object.keys(JOBS).join('|')); process.exit(1); }
if (!existsSync('astra/out')) { console.error('astra/out not found: run from the repo root, after a delivery'); process.exit(1); }
job();
```

Run: `node scripts/import-art.mjs targets`. Expected: five lines `imported <id>`. Check the sizes: each picture under 150 KB, each chip under 5 KB.

- [ ] **Step 2: Offline.** `vite.config.ts`: `globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}']`.

- [ ] **Step 3: Licence records.** `scripts/attributions.mjs`, in `assets`: `{ name: 'Facemaker art by Astra', version: '2026-09', license: 'CC0-1.0', url: 'https://github.com/mixashin/facemaker/blob/main/LICENSE-ASSETS.md' }`. Add `expect(names).toContain('Facemaker art by Astra');` to the test. `LICENSE-ASSETS.md`, new row: `| Pictures for face-on mode (orange, apple, cat, dog, lion) | public/targets/*.webp | CC0 1.0, made for this project with an image generator, released by the operator | this repo |`. Run `node scripts/attributions.mjs`.

- [ ] **Step 4: Run all tests, expect PASS. Commit** Tasks 2 and 3: `feat: face-on geometry, targets from the first art delivery`

---

### Task 4: Face-on layer and shader

**Files:**
- Create: `src/render/faceon.frag`, `src/render/faceOnLayer.ts`, `src/render/faceOnLayer.test.ts`
- Modify: `src/render/renderer.ts`

**Interfaces:**
- Consumes: `Frame`, `Win`, `Target`, `SPAN`, `coverScale` (Task 2), the chain (Task 1), `copy.frag`.
- Produces:

```ts
export type FaceOnView = { target: Target; frame: Frame | null; wins: Win[] };
export class FaceOnLayer {
  constructor(scene: THREE.Scene, shared: Record<string, THREE.IUniform>, load?: (src: string, done: (img: TexImageSource & { width: number; height: number }) => void) => void);
  update(view: FaceOnView | null, canvas: [number, number], element: [number, number]): boolean; // true: the picture is drawn
  dispose(): void;
}
// FaceRenderer: setFaceOn(view: FaceOnView | null): void
```

- [ ] **Step 1: Write the failing test** `src/render/faceOnLayer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaceOnLayer, type FaceOnView } from './faceOnLayer';
import { TARGETS } from '../filters/faceon';

function setup() {
  const pending = new Map<string, (img: never) => void>();
  const load = (src: string, done: (img: never) => void) => { pending.set(src, done); };
  const scene = new THREE.Scene();
  const shared = { uTex: { value: null }, uAspect: { value: 4 / 3 }, uMirror: { value: true }, uCount: { value: 0 }, uHandle: { value: [] }, uType: { value: [] } };
  const layer = new FaceOnLayer(scene, shared, load as never);
  const group = scene.children[0] as THREE.Group;
  const [picture, face] = group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  const arrive = (src: string, width = 1280, height = 1280) => pending.get(src)!({ width, height } as never);
  return { layer, scene, group, picture, face, pending, arrive };
}
const cat = TARGETS.find((t) => t.id === 'cat')!;
const view = (over: Partial<FaceOnView> = {}): FaceOnView => ({ target: cat, frame: { nose: [0.5, 0.5], width: 0.3, roll: 0.1 }, wins: [[-0.2, -0.2, 0.1, 0.06], [0.2, -0.2, 0.1, 0.06], [0, 0.25, 0.16, 0.06]], ...over });

describe('FaceOnLayer', () => {
  it('draws nothing without a target', () => {
    const s = setup();
    expect(s.layer.update(null, [640, 480], [380, 860])).toBe(false);
    expect(s.group.visible).toBe(false);
  });
  it('reports not ready until the picture is loaded', () => {
    const s = setup();
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(false);
    expect(s.group.visible).toBe(false);
    expect([...s.pending.keys()]).toEqual([cat.img]);
    s.arrive(cat.img);
    expect(s.layer.update(view(), [640, 480], [380, 860])).toBe(true);
    expect(s.group.visible).toBe(true);
    s.layer.update(view(), [640, 480], [380, 860]);
    expect(s.pending.size).toBe(1); // loaded once
  });
  it('hides the face without a frame', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    s.layer.update(view({ frame: null, wins: [] }), [640, 480], [380, 860]);
    expect(s.picture.visible).toBe(true);
    expect(s.face.visible).toBe(false);
  });
  it('puts the face quad on the face place of the target', () => {
    const s = setup();
    s.layer.update(view(), [640, 480], [380, 860]); s.arrive(cat.img);
    s.layer.update(view(), [640, 480], [380, 860]);
    expect(s.face.position.x).toBeCloseTo(cat.nose[0] - 0.5, 5);
    expect(s.face.position.y).toBeCloseTo(-(cat.nose[1] - 0.5), 5);
    expect(s.face.scale.x).toBeCloseTo(1.6 * cat.width, 5);
    expect(s.face.material.uniforms.uRoll.value).toBeCloseTo(0.1);
    expect((s.face.material.uniforms.uWin.value as THREE.Vector4[])[2].toArray()).toEqual([0, 0.25, 0.16, 0.06]);
  });
  it('keeps the shape of a photo that is not square', () => {
    const s = setup();
    const photo = { ...cat, id: 'photo', img: 'blob:p', nose: [0.5, 0.25] as [number, number] };
    s.layer.update(view({ target: photo }), [640, 480], [640, 480]); s.arrive('blob:p', 600, 1200);
    s.layer.update(view({ target: photo }), [640, 480], [640, 480]);
    expect(s.picture.scale.y / s.picture.scale.x).toBeCloseTo(2, 5);
    expect(s.face.position.y).toBeCloseTo(-(0.25 - 0.5) * 2, 5); // y in units of the picture width
  });
  it('shares the filter uniforms with the warp shader', () => {
    const s = setup();
    expect(s.face.material.uniforms.uHandle).toBe((s.layer as unknown as { shared: Record<string, unknown> }).shared.uHandle);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

- [ ] **Step 3: Write the shader** `src/render/faceon.frag`

```glsl
// Needs warpChain.glsl in front. The quad shows the live face in face units, cut down to eyes and mouth.
uniform vec2 uNose;    // nose tip in the camera picture
uniform float uWidth;  // face width in x units
uniform float uRoll;   // roll of the head, radians
uniform float uSpan;   // face widths that the quad shows
uniform vec4 uWin[3];  // windows in face units: cx, cy, rx, ry

void main() {
  vec2 q = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * uSpan;   // face units, y down
  if (uMirror) q.x = -q.x;                             // the front camera shows a mirror
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 e = (q - uWin[i].xy) / uWin[i].zw;
    a = max(a, 1.0 - smoothstep(0.55, 1.0, length(e)));
  }
  if (a <= 0.0) discard;
  float c = cos(uRoll), s = sin(uRoll);
  vec2 d = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * uWidth;
  vec2 uv = warp(uNose + vec2(d.x, d.y * uAspect));
  gl_FragColor = vec4(texture2D(uTex, vec2(uv.x, 1.0 - uv.y)).rgb, a);
}
```

- [ ] **Step 4: Write** `src/render/faceOnLayer.ts`

```ts
import * as THREE from 'three';
import vert from './quad.vert?raw';
import copyFrag from './copy.frag?raw';
import chain from './warpChain.glsl?raw';
import frag from './faceon.frag?raw';
import { SPAN, coverScale, type Frame, type Win, type Target } from '../filters/faceon';

export type FaceOnView = { target: Target; frame: Frame | null; wins: Win[] };
type Img = TexImageSource & { width: number; height: number };
type Load = (src: string, done: (img: Img) => void) => void;
const loadImage: Load = (src, done) => {
  const img = new Image();
  img.onload = () => done(img);
  img.onerror = () => console.warn('picture failed to load', src);
  img.src = src;
};

// Second render pass, face-on mode: the target picture, and on it the live eyes and mouth.
export class FaceOnLayer {
  private group = new THREE.Group(); // one unit is the picture width, on both axes
  private picture: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private face: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private textures = new Map<string, THREE.Texture | null>(); // null while the picture loads

  constructor(private scene: THREE.Scene, private shared: Record<string, THREE.IUniform>, private load: Load = loadImage) {
    const geo = new THREE.PlaneGeometry(1, 1);
    // The vertex shader (quad.vert) takes positions as clip space, so the meshes get their place through the matrix: see place().
    this.picture = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: PLACED, fragmentShader: copyFrag, uniforms: { uTex: { value: null } }, depthTest: false, depthWrite: false }));
    this.face = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: PLACED,
      fragmentShader: chain + frag,
      uniforms: { ...shared, uNose: { value: new THREE.Vector2() }, uWidth: { value: 1 }, uRoll: { value: 0 }, uSpan: { value: SPAN }, uWin: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    this.face.renderOrder = 1;
    this.group.add(this.picture, this.face);
    this.group.visible = false;
    scene.add(this.group);
  }

  private texture(src: string): THREE.Texture | null {
    if (this.textures.has(src)) return this.textures.get(src)!;
    this.textures.set(src, null);
    this.load(src, (img) => {
      const t = new THREE.Texture(img as never);
      t.colorSpace = THREE.NoColorSpace; // values go through as they are
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      this.textures.set(src, t);
    });
    return null;
  }

  update(view: FaceOnView | null, canvas: [number, number], element: [number, number]): boolean {
    const tex = view ? this.texture(view.target.img) : null;
    this.group.visible = !!tex;
    if (!view || !tex) return false;
    const img = tex.image as Img, t = view.target, ratio = img.height / img.width;
    const [sx, sy] = coverScale(canvas[0], canvas[1], element[0], element[1], img.width, img.height);
    this.group.scale.set(sx, sy, 1);
    this.picture.material.uniforms.uTex.value = tex;
    this.picture.scale.set(1, ratio, 1);
    this.face.visible = !!view.frame && view.wins.length === 3;
    if (view.frame && this.face.visible) {
      const u = this.face.material.uniforms;
      this.face.position.set(t.nose[0] - 0.5, -(t.nose[1] - 0.5) * ratio, 0);
      this.face.scale.set(SPAN * t.width, SPAN * t.width, 1);
      this.face.rotation.z = -t.angle;
      (u.uNose.value as THREE.Vector2).set(view.frame.nose[0], view.frame.nose[1]);
      u.uWidth.value = view.frame.width;
      u.uRoll.value = view.frame.roll;
      view.wins.forEach((w, i) => (u.uWin.value as THREE.Vector4[])[i].set(w[0], w[1], w[2], w[3]));
    }
    return true;
  }

  dispose(): void {
    this.textures.forEach((t) => t?.dispose());
    this.picture.geometry.dispose();
    this.picture.material.dispose();
    this.face.material.dispose();
    this.scene.remove(this.group);
  }
}

// quad.vert ignores the matrices (the full-screen passes need none). These two meshes have a place.
const PLACED = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
```

Note on `vert`: remove the unused import of `quad.vert` if the type check complains (`noUnusedLocals`). `PLACED` is declared after the class: move it above the class (a `const` is not hoisted).

- [ ] **Step 5: Renderer.** In `src/render/renderer.ts`: keep the warp quad in a field (`private quad: THREE.Mesh`), create `this.faceOn = new FaceOnLayer(this.scene, this.mat.uniforms)` after the warp quad, add `setFaceOn(view: FaceOnView | null): void { this.view = view; }`. In `render()`, before the second pass:

```ts
    const on = this.faceOn.update(this.view, [this.canvas.width, this.canvas.height], [el.width, el.height]);
    this.quad.visible = !on; // face-on mode: the picture takes the place of the camera view
```

The text layer has render order 2: it stays on top. `dispose()` also disposes the layer.

- [ ] **Step 6: Run the tests and the type check, expect PASS. Commit** `feat: face-on layer, live eyes and mouth on a picture`

---

### Task 5: Dock tab, loop, strings, smoke

**Files:**
- Create: `src/app/FaceOnPanel.tsx`
- Modify: `src/app/state.ts`, `src/app/Dock.tsx`, `src/app/App.tsx`, `src/i18n/en.json`, `src/i18n/sr.json`, `scripts/smoke.mjs`

- [ ] **Step 1: State.** `src/app/state.ts`: `DockTab` gets `'faceon'` after `'makeup'`. Add:

```ts
import type { Target } from '../filters/faceon';
export const target = signal<string>('none'); // face-on mode: id of the picture that carries the live eyes and mouth
export const photo = signal<Target | null>(null); // the picture from the device, this session only
```

- [ ] **Step 2: Panel** `src/app/FaceOnPanel.tsx` (the photo chip comes with Task 6: until then the strip leaves it out)

```tsx
import { target } from './state';
import { FACEON, pickTarget } from '../filters/faceon';
import { Strip } from './Strip';
import { t } from '../i18n/i18n';

export function FaceOnPanel() {
  return <Strip items={FACEON.filter((c) => c.id !== 'photo')} value={target.value} onPick={(id) => (target.value = pickTarget(target.value, id))} label={t('tabs.faceon')} />;
}
```

`src/app/Dock.tsx`: tab `{ id: 'faceon', icon: '🍊' }` after `makeup`, body `{tab === 'faceon' && <FaceOnPanel />}`.

- [ ] **Step 3: Loop.** `src/app/App.tsx`, in `loop`, build the handles once and pass the view:

```ts
      const handles = [...handlesForAll(presets.value, faces, aspect, level), ...sliderHandles(sliders.value, faces, aspect, now)];
      r.setHandles(handles);
      const tg = target.value === 'photo' ? photo.value : TARGETS.find((x) => x.id === target.value);
      r.setFaceOn(tg ? { target: tg, frame: faces[0] ? faceFrame(faces[0].landmarks, aspect) : null, wins: faces[0] ? windows(faces[0].landmarks, handles, aspect) : [] } : null);
```

- [ ] **Step 4: Strings.** `tabs.faceon`: en "Funny faces", sr "Smešna lica".

- [ ] **Step 5: Smoke.** `RAIL` gets `faceon`. Add after the makeup block:

```js
  // Face on a picture: the orange fills the screen, the live eyes and mouth sit on it, filters still work.
  const ORANGE = 'r > 200 && g > 90 && g < 170 && b < 80';
  await click('faceon'); await click('none'); await page.waitForTimeout(400);
  const o0 = await tinted(ORANGE);
  const orange = await shot(['orange', '-']);
  await page.waitForTimeout(800);
  const o1 = await tinted(ORANGE);
  console.log('face on a picture: orange pixels', o0, 'with the orange', o1, o1 > o0 + 20000 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/faceon-orange.png`, await page.locator('canvas').screenshot());
  await click('warp'); await click('bigEyes'); await page.waitForTimeout(600);
  const o2 = await tinted(ORANGE);
  console.log('filters work on the picture: orange pixels', o1, 'with big eyes', o2, o2 < o1 - 300 ? 'OK' : 'FAIL');
  if (out) writeFileSync(`${out}/faceon-bigeyes.png`, await page.locator('canvas').screenshot());
  await click('none'); await click('faceon'); await click('orange'); await page.waitForTimeout(500); // second tap: off
  const o3 = await tinted(ORANGE);
  console.log('second tap brings the camera back: orange pixels', o3, Math.abs(o3 - o0) < 500 ? 'OK' : 'FAIL');
```

- [ ] **Step 6: Look and tune.** Take `SMOKE_SHOTS="faceon,orange,-;faceon,apple,-;faceon,cat,-;faceon,dog,-;faceon,lion,-"`. Open each picture. Tune `nose` and `width` per target in `TARGETS`, and `ROOM`, `LEAST`, the soft edge (`smoothstep(0.55, 1.0, ...)`) until: eyes and mouth sit where a face belongs, no animal nose is covered, no hard edge shows, and the skin rim around eyes and mouth is small.

- [ ] **Step 7: Verify (tests, type check, build, full smoke), commit** `feat: face-on tab with five pictures`

---

### Task 6: A photo from the device

**Files:**
- Modify: `src/tracking/types.ts`, `src/tracking/face.worker.ts`, `src/tracking/faceTracker.ts`, `src/tracking/faceTracker.test.ts`, `src/app/FaceOnPanel.tsx`, `src/app/App.tsx`, `src/app/state.ts`, `src/i18n/*.json`, `scripts/smoke.mjs`

- [ ] **Step 1: Messages.** `types.ts`: `WorkerIn` gets `{ type: 'still'; bitmap: ImageBitmap; id: number }`. `WorkerOut` gets `{ type: 'still'; id: number; landmarks: Float32Array | null }`.

- [ ] **Step 2: Failing test** in `faceTracker.test.ts` (worker flow, with the fake worker of that file): `detectStill` posts a `still` message with the bitmap, resolves with the landmarks of the answer with the same id, resolves `null` when the worker is not ready, and two calls at once get their own answers.

- [ ] **Step 3: Tracker.**

```ts
  private stills = new Map<number, (lm: Float32Array | null) => void>();
  private stillId = 0;
  // One-shot detection on a still picture (the device photo of face-on mode). The bitmap is handed over.
  detectStill(bitmap: ImageBitmap): Promise<Float32Array | null> {
    if (!this.worker || !this.ready) { bitmap.close(); return Promise.resolve(null); }
    const id = ++this.stillId;
    return new Promise((resolve) => {
      this.stills.set(id, resolve);
      const msg: WorkerIn = { type: 'still', bitmap, id };
      this.worker!.postMessage(msg, [bitmap]);
    });
  }
```

In `onmessage`: `else if (m.type === 'still') { this.stills.get(m.id)?.(m.landmarks); this.stills.delete(m.id); }`. In `stop()`: resolve every open still with `null`.

- [ ] **Step 4: Worker.** Keep `vision` and `modelPath` from `init`. Add:

```ts
// A still picture: a second landmarker in IMAGE mode, on the CPU, closed after use. The video one keeps its state.
async function still(bitmap: ImageBitmap, id: number) {
  let lm: Float32Array | null = null;
  try {
    if (!vision) throw new Error('not ready');
    const one = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 });
    try {
      const f = one.detect(bitmap).faceLandmarks[0];
      if (f) { lm = new Float32Array(478 * 3); for (let i = 0; i < 478 && i < f.length; i++) lm.set([f[i].x, f[i].y, f[i].z], i * 3); }
    } finally { one.close(); }
  } catch (err) {
    console.warn('still picture', err);
  } finally {
    bitmap.close();
  }
  post({ type: 'still', id, landmarks: lm }, lm ? [lm.buffer] : []);
}
```

- [ ] **Step 5: Panel.** The strip shows every chip of `FACEON`. A tap on `photo` opens a hidden `<input type="file" accept="image/*">`. On a file: `createImageBitmap(file)`, `fitSize`, draw on a canvas of that size, `canvas.toBlob('image/jpeg', 0.9)`, object URL (revoke the old one), a second bitmap from the canvas for `detectStill`, then `photo.value = photoTarget(url, lm, w, h)` and `target.value = 'photo'`. `App.tsx` gives the panel the detector through `state.ts`: `export const still = { detect: null as null | ((b: ImageBitmap) => Promise<Float32Array | null>) };`, set after `t.start()`. No file chosen: nothing changes.

- [ ] **Step 6: Smoke.** `await page.locator('input[type=file]').setInputFiles(face)` after a tap on `photo`. Expected: the target is `photo`, the picture differs from the camera view, no third-party request.

- [ ] **Step 7: Verify, commit** `feat: a photo from the device as face-on picture`

---

### Task 7: Documents, review, pull request

- [ ] `docs/SPEC.md` (M4b as built), `CLAUDE.md` (decisions: face units, windows follow the filters, stickers show only through the windows, second landmarker for stills), `TODO.md` (phone checks: every target, tilted head, near and far, big eyes on the orange, a recording, a device photo with and without a face).
- [ ] Full verification as in M4a Task 6. One fresh reviewer (Fable). Fix Critical and Important findings.
- [ ] Push `m4b-face-on`, open the pull request against `m4a-makeup` (it moves to `main` after M4a merges).
