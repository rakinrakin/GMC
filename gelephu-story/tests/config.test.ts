import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';

describe('CONFIG', () => {
  it('timeline t strictly increases from 0 to 1', () => {
    const ts = CONFIG.timeline.map((k) => k.t);
    expect(ts[0]).toBe(0);
    expect(ts[ts.length - 1]).toBe(1);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });

  it('every limits range has min < max', () => {
    const { azimuth, polar, distance } = CONFIG.limits;
    for (const [min, max] of [azimuth, polar, distance]) expect(min).toBeLessThan(max);
  });

  it('zone ids are unique and >= 1', () => {
    const ids = CONFIG.zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(1);
  });

  it('exactly one zone has an image', () => {
    expect(CONFIG.zones.filter((z) => z.image).length).toBe(1);
  });
});
