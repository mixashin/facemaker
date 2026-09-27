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
