import type { Vector3Tuple } from './coords';

/** Views are authored for 16:9; narrower screens keep that horizontal coverage. */
export const REF_ASPECT = 16 / 9;
/** Vertical fov cap (degrees) before the camera pulls back instead. */
export const MAX_FOV_V = 70;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface Framing {
  /** Vertical fov to use (degrees). */
  fov: number;
  /** Multiplier on the camera's distance from its target (1 = unchanged). */
  distanceScale: number;
}

/**
 * Vertical fov and pull-back that keep the horizontal coverage the view has at refAspect.
 * Wider than refAspect: unchanged.
 */
export function framingFor(fovV: number, aspect: number, refAspect = REF_ASPECT, maxFovV = MAX_FOV_V): Framing {
  if (!(aspect > 0) || aspect >= refAspect) return { fov: fovV, distanceScale: 1 };
  const tanHRef = Math.tan(toRad(fovV) / 2) * refAspect; // tan(hRef/2)
  const fovFit = toDeg(2 * Math.atan(tanHRef / aspect));
  if (fovFit <= maxFovV) return { fov: fovFit, distanceScale: 1 };
  const tanHMax = Math.tan(toRad(maxFovV) / 2) * aspect; // tan(hMax/2)
  return { fov: maxFovV, distanceScale: tanHRef / tanHMax };
}

/** fitView for a Blender-style pose: fov widened, then pos pulled back along (pos − target) if capped. */
export function fitView(
  pos: Vector3Tuple,
  target: Vector3Tuple,
  fovV: number,
  aspect: number,
  refAspect = REF_ASPECT,
  maxFovV = MAX_FOV_V,
): { pos: Vector3Tuple; fov: number } {
  const f = framingFor(fovV, aspect, refAspect, maxFovV);
  if (f.distanceScale === 1) return { pos, fov: f.fov };
  const k = f.distanceScale;
  return {
    pos: [0, 1, 2].map((i) => target[i] + (pos[i] - target[i]) * k) as Vector3Tuple,
    fov: f.fov,
  };
}

/** Timeline t over which the pull-back comes in: none inside the clouds, full at the map key. */
export const PULL_BACK_T: [number, number] = [0.5, 0.9];

/**
 * fitView for a scroll-timeline key. The fov always widens, but the pull-back is weighted by t:
 * early beats put the camera inside the cloud deck, and pulling it back would leave the deck
 * behind (a thin strip over the cloud floor). By the map key it is the full fitView.
 */
export function fitTimelineView<V extends { pos: Vector3Tuple; target: Vector3Tuple; fov: number }>(
  key: V,
  t: number,
  aspect: number,
): V {
  const f = framingFor(key.fov, aspect);
  const u = Math.min(1, Math.max(0, (t - PULL_BACK_T[0]) / (PULL_BACK_T[1] - PULL_BACK_T[0])));
  const w = u * u * (3 - 2 * u);
  const k = 1 + (f.distanceScale - 1) * w;
  const pos = k === 1 ? key.pos : ([0, 1, 2].map((i) => key.target[i] + (key.pos[i] - key.target[i]) * k) as Vector3Tuple);
  return { ...key, pos, fov: f.fov };
}
