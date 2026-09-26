// One Euro filter (Casiez, Roussel, Vogel 2012). Units: tMs in milliseconds, x in normalized 0..1 coords.
// beta 5.0 is the paper's 0.007 scaled from pixels to normalized units (~700 px wide frame). Sweep 2026-09-26:
// beta 0.007 lags a 1 unit/s ramp to 0.81 after 1 s; beta 5 reaches 0.95 and keeps still-signal spread at 0.005.
const TWO_PI = 2 * Math.PI;

function alpha(cutoff: number, dtSec: number): number {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dtSec);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;
  constructor(private minCutoff = 1.0, private beta = 5.0, private dCutoff = 1.0) {}

  reset(): void { this.x = null; this.dx = 0; this.t = null; }

  filter(x: number, tMs: number): number {
    if (this.x === null || this.t === null) { this.x = x; this.t = tMs; return x; }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3);
    this.t = tMs;
    const dxRaw = (x - this.x) / dt;
    const ad = alpha(this.dCutoff, dt);
    this.dx = ad * dxRaw + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = alpha(cutoff, dt);
    this.x = a * x + (1 - a) * this.x;
    return this.x;
  }
}

export class OneEuroArray {
  private filters: OneEuro[];
  constructor(n: number, minCutoff = 1.0, beta = 5.0) {
    this.filters = Array.from({ length: n }, () => new OneEuro(minCutoff, beta));
  }
  reset(): void { this.filters.forEach((f) => f.reset()); }
  filter(src: Float32Array, dst: Float32Array, tMs: number): void {
    for (let i = 0; i < this.filters.length; i++) dst[i] = this.filters[i].filter(src[i], tMs);
  }
}
