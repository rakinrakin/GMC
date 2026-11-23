import { describe, it, expect } from 'vitest';
import { sampleTimeline } from '../../src/math/timeline';
import { clampOrbit, springTowards } from '../../src/math/orbit';
import { decodeZoneId } from '../../src/math/zones';
import { toThree } from '../../src/math/coords';
import type { CamKey, Limits } from '../../src/config';

const keys: CamKey[] = [
  { t: 0, pos: [0, 0, 0], target: [0, 0, 0], fov: 30 },
  { t: 0.5, pos: [10, 20, 30], target: [1, 2, 3], fov: 40 },
  { t: 1, pos: [20, 40, 60], target: [2, 4, 6], fov: 50 },
];

describe('sampleTimeline', () => {
  it('returns keys exactly at their t', () => {
    for (const k of keys) {
      expect(sampleTimeline(keys, k.t)).toEqual({ pos: k.pos, target: k.target, fov: k.fov });
    }
  });
  it('clamps out of range', () => {
    expect(sampleTimeline(keys, -1).fov).toBe(30);
    expect(sampleTimeline(keys, 2).fov).toBe(50);
  });
  it('midpoint lies strictly between neighbours', () => {
    const s = sampleTimeline(keys, 0.25);
    expect(s.fov).toBeGreaterThan(30);
    expect(s.fov).toBeLessThan(40);
    expect(s.pos[0]).toBeGreaterThan(0);
    expect(s.pos[0]).toBeLessThan(10);
  });
});

const l: Limits = { azimuth: [-1, 1], polar: [0.2, 1.2], distance: [5, 50], springBackMs: null };
describe('clampOrbit', () => {
  it('clamps each axis independently', () => {
    expect(clampOrbit({ azimuth: -3, polar: 0.5, distance: 100 }, l)).toEqual({ azimuth: -1, polar: 0.5, distance: 50 });
    expect(clampOrbit({ azimuth: 0, polar: 5, distance: 1 }, l)).toEqual({ azimuth: 0, polar: 1.2, distance: 5 });
  });
  it('leaves in-range unchanged', () => {
    const s = { azimuth: 0.3, polar: 0.7, distance: 20 };
    expect(clampOrbit(s, l)).toEqual(s);
  });
});

describe('springTowards', () => {
  it('halves the gap after half-life', () => {
    expect(springTowards(0, 10, 500, 500)).toBeCloseTo(5, 6);
  });
});

describe('decodeZoneId', () => {
  it('decodes', () => {
    expect(decodeZoneId(3, 0, 0)).toBe(3);
    expect(decodeZoneId(3, 1, 0)).toBe(0);
  });
});

describe('toThree', () => {
  it('maps Blender to three', () => {
    expect(toThree([1, 2, 3])).toEqual([1, 3, -2]);
  });
});
