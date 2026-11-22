import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { pickZone, zoneAtUv } from '../../src/interact/picking';
import type { Stage } from '../../src/scene/stage';
import type { Terrain } from '../../src/scene/terrain';

/** 4×4 RGBA image; row 0 is north (top). Each texel's red = 1 + x + 4·y; texel (3,3) is g-contaminated. */
function synthetic(): ImageData {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      data[i] = 1 + x + 4 * y;
      data[i + 1] = x === 3 && y === 3 ? 9 : 0;
      data[i + 3] = 255;
    }
  }
  return { data, width: 4, height: 4, colorSpace: 'srgb' } as unknown as ImageData;
}

afterEach(() => vi.restoreAllMocks());

describe('zoneAtUv', () => {
  it('maps uv to the nearest texel with v = 1 at the top row (north)', () => {
    const img = synthetic();
    expect(zoneAtUv(img, 0.1, 0.9)).toBe(1); // x 0, row 0
    expect(zoneAtUv(img, 0.6, 0.9)).toBe(3); // x 2, row 0
    expect(zoneAtUv(img, 0.1, 0.1)).toBe(13); // x 0, row 3
    expect(zoneAtUv(img, 1, 0)).toBe(0); // clamped to (3,3): contaminated -> no zone
  });
});

describe('pickZone', () => {
  const stage = { camera: new THREE.PerspectiveCamera() } as unknown as Stage;
  const terrain = { mesh: new THREE.Mesh(), zoneImage: synthetic() } as unknown as Terrain;

  it('reads the zone id at the raycast hit uv', () => {
    const spy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([
      { uv: new THREE.Vector2(0.4, 0.6), distance: 1, point: new THREE.Vector3(), object: terrain.mesh },
    ] as unknown as THREE.Intersection[]);
    // x = floor(0.4·4) = 1, y = floor(0.4·4) = 1 -> 1 + 1 + 4 = 6
    expect(pickZone(new THREE.Vector2(0, 0), stage, terrain)).toBe(6);
    expect(spy).toHaveBeenCalledWith(terrain.mesh, false, expect.anything());
  });

  it('returns 0 when nothing is hit', () => {
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObject').mockReturnValue([]);
    expect(pickZone(new THREE.Vector2(0, 0), stage, terrain)).toBe(0);
  });
});
