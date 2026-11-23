import * as THREE from 'three';

/**
 * Soft cloud shadows drifting over the terrain (the Primland technique): three layers of
 * thresholded tiling noise at different scales and speeds, multiplied into the terrain colour.
 * The wind blows east, the same way as the map canopy drifts.
 */
export const SHADOW_STRENGTH = 0.7;

/**
 * Tiling blob field (R): a sum of soft round puffs of mixed sizes on a torus, normalised to 0..1.
 * Rounder than value noise, so thresholded shadows have no grid-aligned corners.
 */
export function createBlobTexture(seed = 3, size = 128, blobs = 34): THREE.DataTexture {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const puffs = Array.from({ length: blobs }, () => ({
    x: rnd(), y: rnd(), r: 0.03 + rnd() * 0.09, w: 0.5 + rnd() * 0.5,
  }));
  const field = new Float32Array(size * size);
  let max = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size, v = (j + 0.5) / size;
      let f = 0;
      for (const p of puffs) {
        let dx = Math.abs(u - p.x), dy = Math.abs(v - p.y);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        f += p.w * Math.exp(-(dx * dx + dy * dy) / (2 * p.r * p.r));
      }
      field[j * size + i] = f;
      max = Math.max(max, f);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    const v = Math.round(Math.min(1, field[k] / max) * 255);
    data.set([v, v, v, 255], k * 4);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Shared by the terrain material; main advances uShadowTime (seconds, frozen under reduced motion). */
export const shadowUniforms = {
  uShadowTime: { value: 0 },
  uShadowStrength: { value: SHADOW_STRENGTH },
  uShadowNoise: { value: createBlobTexture() as THREE.Texture },
};

/**
 * GLSL: cloudShadow(xz) in three.js world km; 0 = sun, 1 = deepest shadow.
 * Each layer: tile size (km), velocity (tiles per second) and a fixed shift.
 */
export const cloudShadowGlsl = /* glsl */ `
  uniform sampler2D uShadowNoise;
  uniform float uShadowTime;
  uniform float uShadowStrength;
  float shadowLayer(vec2 xz, float tile, vec2 vel, vec2 shift) {
    float n = texture2D(uShadowNoise, xz / tile - vel * uShadowTime + shift).r;
    return smoothstep(0.28, 0.6, n);
  }
  float cloudShadow(vec2 xz) {
    float c1 = shadowLayer(xz, 78.0, vec2(0.0090, 0.0012), vec2(0.0, 0.0));
    float c2 = shadowLayer(xz, 104.0, vec2(0.0072, 0.0009), vec2(0.37, 0.61));
    float c3 = shadowLayer(xz, 46.0, vec2(0.0120, -0.0008), vec2(0.13, 0.29));
    float c = c1 * 0.55 + c2 * 0.5 + c3 * 0.35 * c2;
    return clamp(c, 0.0, 0.7) / 0.7;
  }
  /** Cool, soft shade: plaster in cloud shadow reads blue-grey, never black. */
  vec3 applyCloudShadow(vec3 col, vec2 xz) {
    float s = cloudShadow(xz) * uShadowStrength;
    return col * mix(vec3(1.0), vec3(0.80, 0.83, 0.90), s);
  }
`;
