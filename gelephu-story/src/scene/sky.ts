import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from './stage';

const MIST_HEIGHT = 0.37;
const MIST_SIZE = 5000;
const SKY_RADIUS = 2500;

export interface Sky {
  dome: THREE.Mesh;
  mist: THREE.Mesh;
}

export function createSky(stage: Stage): Sky {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: new THREE.Color(CONFIG.colors.skyHorizon) },
        uZenith: { value: new THREE.Color(CONFIG.colors.skyZenith) },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying vec3 vWorld;
        void main() {
          #include <logdepthbuf_fragment>
          float h = clamp(normalize(vWorld - cameraPosition).y, 0.0, 1.0);
          gl_FragColor = vec4(mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  dome.name = 'sky';
  dome.renderOrder = -1;
  dome.frustumCulled = false;

  const mist = new THREE.Mesh(
    new THREE.PlaneGeometry(MIST_SIZE, MIST_SIZE),
    new THREE.MeshBasicMaterial({ color: CONFIG.colors.mist, depthWrite: false }),
  );
  mist.name = 'mist';
  // The terrain floor is clamped to exactly this height, so the two are coplanar. Drawing the
  // mist first without depth lets the terrain always win; mist only shows past the mesh edge.
  mist.renderOrder = -0.5;
  mist.rotation.x = -Math.PI / 2;
  mist.position.y = MIST_HEIGHT;

  stage.scene.add(dome, mist);
  return { dome, mist };
}
