import * as THREE from 'three';
import { toThree, type Vector3Tuple } from '../math/coords';
import type { Atlas } from './clouds';

/**
 * Map canopy: a sparse layer of camera-facing clouds drifting east over the relief once the
 * descent lands (the Primland technique). Each card slides across a fixed band and wraps,
 * fading at both ends. A screen-space hole opens at the centre of the view (uOpening) so the
 * clouds frame the map rather than cover it; some cards vanish entirely as it opens. Edges
 * churn with a two-phase flow map and the colour shifts between white and a pale grey.
 */
export const CANOPY = {
  /** Blender-style km: x range the cards drift across (they wrap), y and z ranges they sit in. */
  boundsX: [-170, 150] as [number, number],
  boundsY: [-85, 45] as [number, number],
  boundsZ: [24, 58] as [number, number],
  width: [60, 115] as [number, number],
  /** Height squash per card: wide, flat streaks rather than puffs (Primland stretches ~2x). */
  squash: [0.35, 0.6] as [number, number],
  /** km per second of eastward drift (per-card factor 0.6-1.4). */
  drift: 0.9,
  /** Share of the cards that disappear as the centre opens. */
  openingShare: 0.45,
  /** Screen-centre hole: fully clear inside r0, untouched beyond r1 (fraction of the long side). */
  hole: [0.2, 0.43] as [number, number],
  /** View-depth fade (km): cards dissolve as the camera comes close. */
  nearFade: [6, 28] as [number, number],
  colorA: '#FFFFFF',
  colorB: '#E2E4E8',
};

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uAspects[5];
  uniform float uTime;
  uniform float uDrift;
  uniform vec2 uBoundsX;
  attribute vec4 aCanopy; // x: texture index, y: phase 0..1, z: speed factor, w: vanishes on opening
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  varying float vEnds;
  varying float vVanish;
  flat varying int vTex;
  void main() {
    vUv = uv;
    int ti = int(aCanopy.x + 0.5);
    vTex = ti;
    vVanish = aCanopy.w;
    vSeed = vec2(aCanopy.y, fract(aCanopy.z * 7.31));
    float w = length(instanceMatrix[0].xyz);
    // Instance y scale carries the squash (as a fraction of the width).
    float h = length(instanceMatrix[1].xyz) / w / uAspects[ti];
    vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float span = uBoundsX.y - uBoundsX.x;
    float prog = fract(aCanopy.y + uTime * uDrift * aCanopy.z / span);
    c.x = uBoundsX.x + prog * span;
    vEnds = smoothstep(0.0, 0.1, prog) * smoothstep(1.0, 0.9, prog);
    // Full billboard: the card faces the camera.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec4 wp = vec4(c.xyz + right * position.x * w + up * position.y * h * w, 1.0);
    vec4 mv = viewMatrix * wp;
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uNoise;
  uniform vec4 uRects[5];
  uniform float uTime;
  uniform float uOpacity;
  uniform float uOpening;
  uniform vec2 uResolution;
  uniform vec2 uHole;
  uniform vec2 uNearFade;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  varying float vEnds;
  varying float vVanish;
  flat varying int vTex;
  void main() {
    #include <logdepthbuf_fragment>
    // Screen-centre hole, measured in units of the long side of the view.
    vec2 st = gl_FragCoord.xy / uResolution - 0.5;
    st *= uResolution / max(uResolution.x, uResolution.y);
    float centre = 1.0 - smoothstep(uHole.x, uHole.y, length(st));
    float clearing = 1.0 - centre * 0.98 * uOpening;
    float vanish = 1.0 - vVanish * uOpening;
    if (clearing < 0.01 || vanish < 0.01) discard;

    // Two-phase flow map: displacement grows over a cycle, two copies half a cycle apart cross-fade.
    float t = uTime * 0.02;
    vec2 fa = texture2D(uNoise, vUv + vSeed + vec2(t)).rg;
    vec2 fb = texture2D(uNoise, vUv * 0.5 + vSeed.yx - vec2(t)).rg;
    vec2 flow = (fa * 0.8 + fb * 0.2 - 0.5) * 2.0;
    float cyc = uTime * 0.08;
    float k = abs(fract(cyc) - 0.5) * 2.0;
    vec2 disp = mix(flow * fract(cyc), flow * fract(cyc + 0.5), k);
    vec2 big = texture2D(uNoise, (vUv - 0.5) * 0.15 + vec2(0.83 + t * 0.5, vSeed.x)).rg;
    big = (smoothstep(vec2(0.55), vec2(0.8), big) - 0.5) * 2.0;
    vec2 uv = clamp(vUv + disp * 0.02 + big * 0.03, 0.0, 1.0);

    vec4 r = uRects[vTex];
    vec4 tex = texture2D(uMap, vec2(r.x + uv.x * r.z, r.y + (1.0 - uv.y) * r.w));
    float shape = tex.a;
    // Fine turbulence eats into the thin parts only.
    float small = smoothstep(0.62, 0.9, texture2D(uNoise, vUv * 2.0 + vec2(-t * 3.0, t * 3.0)).g);
    float a = clamp(shape - small * (1.0 - shape) * 0.6, 0.0, 1.0);
    vec2 e = smoothstep(vec2(0.0), vec2(0.06), vUv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - vUv);
    a *= e.x * e.y * vEnds * clearing * vanish * uOpacity;
    a *= smoothstep(uNearFade.x, uNearFade.y, vViewZ);
    if (a < 0.002) discard;

    float tint = clamp(1.0 - (disp.x + disp.y), 0.0, 1.0);
    vec3 col = tex.rgb * mix(uColorB, uColorA, tint);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

export interface Canopy {
  group: THREE.Group;
  readonly count: number;
  setOpacity(v: number): void;
  /** 0: clouds cover the view; 1: the centre is open and the vanishing share is gone. */
  setOpening(v: number): void;
  /** Keeps the screen-space hole in drawing-buffer pixels. */
  setResolution(w: number, h: number): void;
}

export function createCanopy(opts: {
  count: number;
  atlas: Atlas;
  noise: { value: THREE.Texture };
  time: { value: number };
  /** Drift multiplier (0 under reduced motion). */
  drift: number;
  /** Camera (Blender-style) the cards are sorted back-to-front against. */
  sortFrom: Vector3Tuple;
  rnd: () => number;
  renderOrder: number;
}): Canopy {
  const { rnd } = opts;
  const n = Math.max(0, opts.count);
  const cap = Math.max(1, n);
  const u = (a: number, b: number) => a + rnd() * (b - a);
  const opacity = { value: 0 };
  const opening = { value: 0 };
  const resolution = { value: new THREE.Vector2(1, 1) };

  const geometry = new THREE.PlaneGeometry(1, 1);
  const aCanopy = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  geometry.setAttribute('aCanopy', aCanopy);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: opts.atlas.uMap,
      uRects: opts.atlas.uRects,
      uAspects: opts.atlas.uAspects,
      uNoise: opts.noise,
      uTime: opts.time,
      uDrift: { value: CANOPY.drift * opts.drift },
      uBoundsX: { value: new THREE.Vector2(...CANOPY.boundsX) },
      uOpacity: opacity,
      uOpening: opening,
      uResolution: resolution,
      uHole: { value: new THREE.Vector2(...CANOPY.hole) },
      uNearFade: { value: new THREE.Vector2(...CANOPY.nearFade) },
      uColorA: { value: new THREE.Color(CANOPY.colorA) },
      uColorB: { value: new THREE.Color(CANOPY.colorB) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    // Above the relief whatever the terrain height: the canopy always reads as sky.
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.name = 'clouds_canopy_cards';
  mesh.renderOrder = opts.renderOrder;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'clouds_canopy';
  group.add(mesh);

  // Cards drift along x, so the back-to-front order comes from y and z only.
  const from = new THREE.Vector3(...toThree(opts.sortFrom));
  const cards = Array.from({ length: n }, () => {
    const pos: Vector3Tuple = [0, u(...CANOPY.boundsY), u(...CANOPY.boundsZ)];
    return {
      pos,
      width: u(...CANOPY.width),
      squash: u(...CANOPY.squash),
      tex: Math.floor(rnd() * 5),
      phase: rnd(),
      speed: u(0.6, 1.4),
      vanish: rnd() < CANOPY.openingShare ? 1 : 0,
    };
  });
  const depth = (p: Vector3Tuple) => {
    const [, y, z] = toThree(p);
    return (y - from.y) ** 2 + (z - from.z) ** 2;
  };
  cards.sort((a, b) => depth(b.pos) - depth(a.pos));
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  cards.forEach((c, i) => {
    p.set(...toThree(c.pos));
    s.set(c.width, c.width * c.squash, c.width);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    aCanopy.setXYZW(i, c.tex, c.phase, c.speed, c.vanish);
  });
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  aCanopy.needsUpdate = true;
  mesh.visible = false;
  opts.atlas.onReady(() => (mesh.visible = true));
  group.visible = false;

  return {
    group,
    count: n,
    setOpacity(v) {
      opacity.value = v;
      group.visible = v > 0 && n > 0;
    },
    setOpening(v) {
      opening.value = v;
    },
    setResolution(w, h) {
      resolution.value.set(Math.max(1, w), Math.max(1, h));
    },
  };
}
