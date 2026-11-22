import * as THREE from 'three';
import { decodeZoneId } from '../math/zones';
import type { Stage } from '../scene/stage';
import type { Terrain } from '../scene/terrain';

type ImageLike = Pick<ImageData, 'data' | 'width' | 'height'>;

/**
 * Zone id of the nearest zone-map texel to a terrain uv. Image row 0 is north and the mesh
 * has v = 1 at north (textures load with flipY), so the row is (1 − v)·H.
 */
export function zoneAtUv(img: ImageLike, u: number, v: number): number {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)));
  const i = (y * img.width + x) * 4;
  return decodeZoneId(img.data[i], img.data[i + 1], img.data[i + 2]);
}

const raycaster = new THREE.Raycaster();
const hits: THREE.Intersection[] = [];

/** Zone id under a normalised device coordinate (−1..1), or 0. */
export function pickZone(
  ndc: THREE.Vector2,
  stage: Pick<Stage, 'camera'>,
  terrain: Pick<Terrain, 'mesh' | 'zoneImage'>,
): number {
  raycaster.setFromCamera(ndc, stage.camera);
  hits.length = 0;
  const found = raycaster.intersectObject(terrain.mesh, false, hits);
  const hit = found[0];
  if (!hit || !hit.uv) return 0;
  return zoneAtUv(terrain.zoneImage, hit.uv.x, hit.uv.y);
}
