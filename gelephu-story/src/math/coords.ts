export type Vector3Tuple = [number, number, number];

/** Blender-style (x east, y north, z up) to three.js Y-up with north = -Z. */
export function toThree(v: Vector3Tuple): Vector3Tuple {
  return [v[0], v[2], -v[1]];
}
