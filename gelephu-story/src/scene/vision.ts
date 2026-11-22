import * as THREE from 'three';
import { CONFIG } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import type { Stage } from './stage';

/** The project vision plane, Blender-style km. Faces the "Gelephu core" camera. */
export const VISION = {
  center: [-12, 125, 15.5] as Vector3Tuple,
  width: 150,
  /** project_spire.webp is 1942 × 1082. */
  aspect: 1082 / 1942,
  haze: '#CCD6E5',
  /** The photo's own sky (sRGB, ~rgb(170,195,210)) is keyed out so our sky shows through. */
  skyKey: [170 / 255, 195 / 255, 210 / 255] as [number, number, number],
  /** Drawn after the terrain and break-up clouds, before the veil (3). */
  renderOrder: 2.5,
};

export interface Vision {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  setOpacity(v: number): void;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform vec3 uHaze;
  uniform vec3 uHorizon;
  uniform vec3 uSkyKey;
  uniform float uOpacity;
  varying vec2 vUv;

  // 1 where the photo shows its own sky: close to the sky colour, or bright and blue-leaning,
  // and only in the upper part. Hills are dark and the spire is warm (blue below red): both stay.
  float skyKey(vec3 s) {
    float lum = dot(s, vec3(0.299, 0.587, 0.114));
    float near = 1.0 - smoothstep(0.10, 0.22, distance(s, uSkyKey));
    float bright = smoothstep(0.50, 0.62, lum) * smoothstep(0.0, 0.05, s.b - s.r);
    return max(near, bright) * smoothstep(0.35, 0.50, vUv.y);
  }

  void main() {
    #include <logdepthbuf_fragment>
    // The map is sampled raw (sRGB) so the key works on the photo's own values.
    vec3 s = texture2D(uMap, vUv).rgb;
    vec3 col = sRGBTransferEOTF(vec4(s, 1.0)).rgb;
    float mask = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.66, vUv.x)
      * smoothstep(0.02, 0.30, vUv.y) * smoothstep(1.0, 0.80, vUv.y);
    col = mix(col, uHaze, mix(0.18, 0.0, clamp(vUv.y / 0.8, 0.0, 1.0)));
    // Toward the edges what remains melts into our horizon colour.
    col = mix(col, uHorizon, (1.0 - mask) * 0.5);
    gl_FragColor = vec4(col, mask * (1.0 - skyKey(s)) * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** Yaw (about three.js +Y) that turns a plane's +Z normal toward the camera at `pos` (Blender-style). */
function faceYaw(center: Vector3Tuple, pos: Vector3Tuple): number {
  const c = toThree(center);
  const p = toThree(pos);
  return Math.atan2(p[0] - c[0], p[2] - c[2]);
}

export function createVision(stage: Pick<Stage, 'scene'> & Partial<Pick<Stage, 'renderer'>>, url: string): Vision {
  const map = new THREE.TextureLoader().load(url);
  // Raw sRGB values: the shader keys the sky on them and decodes to linear itself.
  map.colorSpace = THREE.NoColorSpace;
  map.anisotropy = stage.renderer?.capabilities.getMaxAnisotropy() ?? 1;

  const uniforms = {
    uMap: { value: map as THREE.Texture },
    uHaze: { value: new THREE.Color(VISION.haze) },
    uHorizon: { value: new THREE.Color(CONFIG.colors.skyHorizon) },
    uSkyKey: { value: new THREE.Vector3(...VISION.skyKey) },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(VISION.width, VISION.width * VISION.aspect), material);
  mesh.name = 'vision';
  mesh.position.set(...toThree(VISION.center));
  const core = CONFIG.zones.find((z) => z.name === 'Gelephu core') ?? CONFIG.zones[0];
  mesh.rotation.y = faceYaw(VISION.center, core.view.pos);
  mesh.renderOrder = VISION.renderOrder;
  mesh.frustumCulled = false;
  mesh.visible = false;
  stage.scene.add(mesh);

  return {
    mesh,
    setOpacity(v: number) {
      uniforms.uOpacity.value = v;
      mesh.visible = v > 0;
    },
  };
}
