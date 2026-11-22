import type { CamKey } from '../config';
import type { Vector3Tuple } from './coords';

const smooth = (f: number) => f * f * (3 - 2 * f);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerp3 = (a: Vector3Tuple, b: Vector3Tuple, f: number): Vector3Tuple => [
  lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f),
];

export function sampleTimeline(
  keys: CamKey[], t: number,
): { pos: Vector3Tuple; target: Vector3Tuple; fov: number } {
  const ks = [...keys].sort((a, b) => a.t - b.t);
  const tc = Math.min(1, Math.max(0, t));
  const first = ks[0], last = ks[ks.length - 1];
  if (tc <= first.t) return { pos: [...first.pos], target: [...first.target], fov: first.fov };
  if (tc >= last.t) return { pos: [...last.pos], target: [...last.target], fov: last.fov };
  let i = 0;
  while (i < ks.length - 2 && tc > ks[i + 1].t) i++;
  const a = ks[i], b = ks[i + 1];
  if (tc === a.t) return { pos: [...a.pos], target: [...a.target], fov: a.fov };
  if (tc === b.t) return { pos: [...b.pos], target: [...b.target], fov: b.fov };
  const f = smooth((tc - a.t) / (b.t - a.t));
  return { pos: lerp3(a.pos, b.pos, f), target: lerp3(a.target, b.target, f), fov: lerp(a.fov, b.fov, f) };
}
