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
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 col = texture2D(uMap, vUv).rgb;
    float mask = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.66, vUv.x)
      * smoothstep(0.02, 0.30, vUv.y) * smoothstep(1.0, 0.80, vUv.y);
    col = mix(col, uHaze, mix(0.18, 0.0, clamp(vUv.y / 0.8, 0.0, 1.0)));
    gl_FragColor = vec4(col, mask * uOpacity);
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
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = stage.renderer?.capabilities.getMaxAnisotropy() ?? 1;

  const uniforms = {
    uMap: { value: map as THREE.Texture },
    uHaze: { value: new THREE.Color(VISION.haze) },
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
