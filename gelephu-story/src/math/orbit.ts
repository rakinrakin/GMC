import type { Limits } from '../config';

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

export function clampOrbit(
  sph: { azimuth: number; polar: number; distance: number }, l: Limits,
): { azimuth: number; polar: number; distance: number } {
  return {
    azimuth: clamp(sph.azimuth, l.azimuth),
    polar: clamp(sph.polar, l.polar),
    distance: clamp(sph.distance, l.distance),
  };
}

/** Exponential approach; the gap halves every halfLifeMs. */
export function springTowards(cur: number, goal: number, dtMs: number, halfLifeMs: number): number {
  return goal + (cur - goal) * Math.pow(0.5, dtMs / halfLifeMs);
}
