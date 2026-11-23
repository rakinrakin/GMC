import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CONFIG } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import zonesJson from '../../public/assets/zones.json';
import { loadImageData } from './imageData';
import type { Stage } from './stage';
import { MIST_COLOR, MIST_HEIGHT } from './palette';
import { cloudShadowGlsl, shadowUniforms } from './cloudShadows';

export interface TerrainUniforms {
  uHover: { value: number };
  uSelected: { value: number };
  uFocus: { value: number };
  uFocusCenter: { value: THREE.Vector2 };
}

export interface Terrain {
  mesh: THREE.Mesh;
  uniforms: TerrainUniforms;
  zoneImage: ImageData;
}

export interface TerrainTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  zones: THREE.Texture;
}

/** Same sun as the bake: north-west, ~18 degrees up. Blender frame, pointing toward the sun. */
const SUN_BLENDER: Vector3Tuple = [-0.62, 0.62, 0.33];
const NORMAL_WEIGHT = 0.15;
const PLASTER_MIX = 0.78;
const HOVER_LIGHTEN = 0.12;
const FOCUS_FOG_MAX = 0.72;
/**
 * Width of the edge fade, as a fraction of each UV axis. Over it the colour goes to the mist and
 * the height down to the mist plane, so the mesh never shows as a hard-edged slab (portrait
 * framing pulls back far enough to see all four edges). At 16:9 the band stays off-screen.
 */
export const EDGE_FADE = 0.12;
/**
 * The far (north, v → 1) edge is seen at a grazing angle, which squeezes its band to a few
 * pixels on portrait. It gets a wider band; the 16:9 map key frame ends at v ≈ 0.80, so 0.18 stays
 * off-screen there.
 */
export const EDGE_FADE_FAR = 0.18;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** CPU mirror of the shader's edge factor: 0 on the mesh boundary, 1 from EDGE_FADE inward. */
export function edgeFactor(u: number, v: number, edge = EDGE_FADE, far = EDGE_FADE_FAR): number {
  return smoothstep(0, edge, Math.min(u, 1 - u, v)) * smoothstep(0, far, 1 - v);
}

const edgeGlsl = /* glsl */ `
  float edgeFactor(vec2 uv) {
    float d = min(min(uv.x, 1.0 - uv.x), uv.y);
    return smoothstep(0.0, uEdge, d) * smoothstep(0.0, uEdgeFar, 1.0 - uv.y);
  }
`;

const coreZone = (zonesJson as unknown as Array<{ id: number; centroidKm: [number, number]; core?: boolean }>)
  .find((z) => z.core);
const CORE_CENTROID: [number, number] = coreZone ? coreZone.centroidKm : [0, 0];

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uEdge;
  uniform float uEdgeFar;
  uniform float uMistY;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${edgeGlsl}
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Ease the height down to the mist plane at the boundary: no silhouette standing at the edge.
    wp.y = mix(uMistY, wp.y, edgeFactor(uv));
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uColor;
  uniform sampler2D uNormal;
  uniform sampler2D uZones;
  uniform vec3 uSun;
  uniform vec3 uZoneColor;
  uniform vec3 uPlaster;
  uniform vec3 uMist;
  uniform float uHover;
  uniform float uSelected;
  uniform float uFocus;
  uniform vec2 uFocusCenter;
  uniform vec2 uFogRange;
  uniform float uEdge;
  uniform float uEdgeFar;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${edgeGlsl}
  ${cloudShadowGlsl}

  // x: zone colour strength, y: hover strength, for one zone-id texel.
  vec2 zoneWeights(ivec2 p, ivec2 size) {
    p = clamp(p, ivec2(0), size - 1);
    float id = floor(texelFetch(uZones, p, 0).r * 255.0 + 0.5);
    if (id < 0.5) return vec2(0.0);
    bool on = uSelected < 0.5 || abs(id - uSelected) < 0.5;
    float strength = on ? 1.0 : 1.0 - ${PLASTER_MIX.toFixed(2)} * clamp(uFocus, 0.0, 1.0);
    float hover = (uHover > 0.5 && abs(id - uHover) < 0.5) ? 1.0 : 0.0;
    return vec2(strength, hover);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 base = texture2D(uColor, vUv).rgb;

    // Crispness only: the bake already holds the full sun shading.
    vec3 nb = texture2D(uNormal, vUv).rgb * 2.0 - 1.0;
    vec3 n = normalize(vec3(nb.x, nb.z, -nb.y));
    float lambert = clamp(max(dot(n, uSun), 0.0) / max(uSun.y, 1e-3), 0.0, 2.0);
    base *= 1.0 + ${NORMAL_WEIGHT.toFixed(2)} * (lambert - 1.0);

    // Zone ids: nearest texels, blended with a smoothstep across one texel at the edges.
    ivec2 size = textureSize(uZones, 0);
    vec2 st = vUv * vec2(size) - 0.5;
    ivec2 p0 = ivec2(floor(st));
    vec2 f = smoothstep(0.0, 1.0, fract(st));
    vec2 w = mix(
      mix(zoneWeights(p0, size), zoneWeights(p0 + ivec2(1, 0), size), f.x),
      mix(zoneWeights(p0 + ivec2(0, 1), size), zoneWeights(p0 + ivec2(1, 1), size), f.x),
      f.y);

    // Maroon keeps the baked shading by scaling with the plaster ratio.
    vec3 shade = clamp(base / uPlaster, 0.0, 1.5);
    vec3 col = mix(base, uZoneColor * shade, w.x);
    col = mix(col, vec3(1.0), ${HOVER_LIGHTEN.toFixed(2)} * w.y);
    col = applyCloudShadow(col, vWorld.xz);

    float d = distance(vWorld.xz, uFocusCenter);
    col = mix(col, uMist, uFocus * smoothstep(uFogRange.x, uFogRange.y, d) * ${FOCUS_FOG_MAX.toFixed(2)});
    // Edge fade: exactly the mist colour on the boundary, where the mist disc takes over.
    col = mix(uMist, col, edgeFactor(vUv));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Builds the terrain material. focusCentroid is a Blender-style (x east, y north) point in km. */
export function createTerrainMaterial(
  textures: TerrainTextures,
  focusCentroid: [number, number] = CORE_CENTROID,
): { material: THREE.ShaderMaterial; uniforms: TerrainUniforms } {
  const uniforms: TerrainUniforms = {
    uHover: { value: 0 },
    uSelected: { value: 0 },
    uFocus: { value: 0 },
    uFocusCenter: { value: new THREE.Vector2(focusCentroid[0], -focusCentroid[1]) },
  };
  const sun = new THREE.Vector3(...toThree(SUN_BLENDER)).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uColor: { value: textures.color },
      uNormal: { value: textures.normal },
      uZones: { value: textures.zones },
      uSun: { value: sun },
      uZoneColor: { value: new THREE.Color(CONFIG.colors.zone) },
      uPlaster: { value: new THREE.Color(CONFIG.colors.plaster) },
      uMist: MIST_COLOR,
      uEdge: { value: EDGE_FADE },
      uEdgeFar: { value: EDGE_FADE_FAR },
      uMistY: { value: MIST_HEIGHT },
      uFogRange: { value: new THREE.Vector2(CONFIG.fog.near, CONFIG.fog.far) },
      ...shadowUniforms,
    },
    vertexShader,
    fragmentShader,
  });
  return { material, uniforms };
}

export async function loadTerrain(
  stage: Stage,
  onProgress: (fraction: number) => void,
): Promise<Terrain> {
  const mobile = stage.tier === 'mobile';
  const suffix = mobile ? '_mobile' : '';
  const glbUrl = `assets/terrain_${mobile ? 'mobile' : 'desktop'}.glb`;

  const draco = new DRACOLoader();
  draco.setDecoderPath('draco/');
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  const texLoader = new THREE.TextureLoader();

  // The mesh dominates the download; textures count as one step each.
  const parts = { glb: 0, color: 0, normal: 0, zones: 0, zoneImage: 0 };
  const weights = { glb: 4, color: 2, normal: 2, zones: 1, zoneImage: 1 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const report = (key: keyof typeof parts, f: number) => {
    parts[key] = Math.min(1, Math.max(parts[key], f));
    let sum = 0;
    for (const k of Object.keys(parts) as Array<keyof typeof parts>) sum += parts[k] * weights[k];
    onProgress(sum / total);
  };
  const track = <T>(key: keyof typeof parts, p: Promise<T>) =>
    p.then((v) => {
      report(key, 1);
      return v;
    });

  const [gltf, color, normal, zones, zoneImage] = await Promise.all([
    track('glb', gltfLoader.loadAsync(glbUrl, (e) => {
      if (e.lengthComputable && e.total > 0) report('glb', (e.loaded / e.total) * 0.95);
    })),
    track('color', texLoader.loadAsync(`assets/terrain_color${suffix}.webp`)),
    track('normal', texLoader.loadAsync(`assets/terrain_normal${suffix}.webp`)),
    track('zones', texLoader.loadAsync('assets/zones_id.png')),
    track('zoneImage', loadImageData('assets/zones_id.png')),
  ]);
  draco.dispose?.();

  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = stage.renderer?.capabilities.getMaxAnisotropy() ?? 1;
  normal.colorSpace = THREE.NoColorSpace;
  zones.colorSpace = THREE.NoColorSpace;
  zones.minFilter = THREE.NearestFilter;
  zones.magFilter = THREE.NearestFilter;
  zones.generateMipmaps = false;
  for (const t of [color, normal, zones]) t.needsUpdate = true;

  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`No mesh in ${glbUrl}`);

  const { material, uniforms } = createTerrainMaterial({ color, normal, zones });
  const old = mesh.material;
  (Array.isArray(old) ? old : [old]).forEach((m) => m.dispose());
  mesh.material = material;
  mesh.name = 'terrain';
  gltf.scene.updateMatrixWorld(true);
  stage.scene.attach(mesh);

  onProgress(1);
  return { mesh, uniforms, zoneImage };
}
