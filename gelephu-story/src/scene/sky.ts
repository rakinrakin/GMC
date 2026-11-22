import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from './stage';

const MIST_HEIGHT = 0.37;
const SKY_RADIUS = 2500;
/**
 * Mist disc radius (km). The terrain reaches ~155 km from the centre (corners), so the fade below
 * starts just past it (160 km). Beyond the rim the dome's lowest band shows: the same horizon colour.
 * A disc reaching the dome (2500 km) left unfaded mist from ~100 to ~1500 km: in tilted views
 * that read as a grey band under the horizon.
 */
export const MIST_RADIUS = 400;
/**
 * Fraction of the mist radius over which its colour fades to the sky horizon colour (the dome's
 * lowest band). Without it a grey band shows where the mist ends against the dome in tilted views.
 */
export const MIST_FADE: [number, number] = [0.4, 1.0];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** CPU mirror of the mist shader: colour at a fraction r (0 centre, 1 rim) of the radius. */
export function mistColorAt(r: number): THREE.Color {
  return new THREE.Color(CONFIG.colors.mist).lerp(new THREE.Color(CONFIG.colors.skyHorizon), smoothstep(MIST_FADE[0], MIST_FADE[1], r));
}

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
    new THREE.CircleGeometry(MIST_RADIUS, 96),
    new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        uMist: { value: new THREE.Color(CONFIG.colors.mist) },
        // Same Color instance as the dome: the two can never drift apart.
        uHorizon: dome.material.uniforms.uHorizon,
        uFade: { value: new THREE.Vector2(MIST_FADE[0] * MIST_RADIUS, MIST_FADE[1] * MIST_RADIUS) },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vLocal;
        void main() {
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uMist;
        uniform vec3 uHorizon;
        uniform vec2 uFade;
        varying vec2 vLocal;
        void main() {
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(mix(uMist, uHorizon, smoothstep(uFade.x, uFade.y, length(vLocal))), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
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
