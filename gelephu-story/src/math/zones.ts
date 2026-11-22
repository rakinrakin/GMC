/** Zone id is encoded in the red channel; any g/b contamination means no zone. */
export function decodeZoneId(r: number, g: number, b: number): number {
  return g === 0 && b === 0 ? r : 0;
}
