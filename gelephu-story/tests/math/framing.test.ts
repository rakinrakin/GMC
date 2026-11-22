import { describe, it, expect } from 'vitest';
import { fitView, framingFor, fitTimelineView } from '../../src/math/framing';
import type { Vector3Tuple } from '../../src/math/coords';

const rad = (d: number) => (d * Math.PI) / 180;
const pos: Vector3Tuple = [0, -60, 40];
const target: Vector3Tuple = [0, 0, 2];
const dist = (a: Vector3Tuple, b: Vector3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Horizontal span (km) at the target distance. */
const hSpan = (p: Vector3Tuple, fovV: number, aspect: number) => 2 * dist(p, target) * Math.tan(rad(fovV) / 2) * aspect;

describe('fitView', () => {
  it('is unchanged at 16:9 and wider', () => {
    expect(fitView(pos, target, 40, 16 / 9)).toEqual({ pos, fov: 40 });
    expect(fitView(pos, target, 40, 21 / 9)).toEqual({ pos, fov: 40 });
  });
  it('widens the vertical fov at 4:3 to keep the 16:9 horizontal span, same position', () => {
    const v = fitView(pos, target, 40, 4 / 3);
    expect(v.pos).toEqual(pos);
    expect(v.fov).toBeGreaterThan(40);
    expect(v.fov).toBeLessThanOrEqual(70);
    expect(hSpan(v.pos, v.fov, 4 / 3)).toBeCloseTo(hSpan(pos, 40, 16 / 9), 6);
  });
  it('caps the fov at 70° and pulls back along the view line at 375×812', () => {
    const aspect = 375 / 812;
    const v = fitView(pos, target, 40, aspect);
    expect(v.fov).toBe(70);
    expect(dist(v.pos, target)).toBeGreaterThan(dist(pos, target));
    // Still on the same line through the target.
    const d0 = pos.map((c, i) => c - target[i]);
    const d1 = v.pos.map((c, i) => c - target[i]);
    const k = d1[1] / d0[1];
    d0.forEach((c, i) => expect(d1[i]).toBeCloseTo(c * k, 6));
    const ref = hSpan(pos, 40, 16 / 9);
    expect(Math.abs(hSpan(v.pos, v.fov, aspect) - ref) / ref).toBeLessThan(0.01);
  });
});

describe('framingFor', () => {
  it('gives scale 1 when no pull-back is needed and >1 on portrait', () => {
    expect(framingFor(40, 16 / 9)).toEqual({ fov: 40, distanceScale: 1 });
    expect(framingFor(40, 4 / 3).distanceScale).toBe(1);
    const f = framingFor(40, 375 / 812);
    expect(f.fov).toBe(70);
    expect(f.distanceScale).toBeGreaterThan(1);
  });
});

describe('fitTimelineView', () => {
  const key = { pos: [0, -70, 16.8] as Vector3Tuple, target: [0, 40, 14.6] as Vector3Tuple, fov: 39.8 };
  const aspect = 375 / 812;
  it('inside the clouds (t ≤ 0.5): fov widened to the cap, no pull-back (the camera stays in the deck)', () => {
    const v = fitTimelineView(key, 0, aspect);
    expect(v.fov).toBe(70);
    expect(v.pos).toEqual(key.pos);
    expect(fitTimelineView(key, 0.5, aspect).pos).toEqual(key.pos);
  });
  it('at the map key (t = 1) it is exactly fitView', () => {
    const f = fitView(key.pos, key.target, key.fov, aspect);
    const v = fitTimelineView(key, 1, aspect);
    expect(v.fov).toBe(f.fov);
    v.pos.forEach((c, i) => expect(c).toBeCloseTo(f.pos[i], 9));
  });
  it('is unchanged at 16:9 for every t', () => {
    for (const t of [0, 0.4, 0.7, 1]) expect(fitTimelineView(key, t, 16 / 9)).toEqual({ ...key });
  });
});
