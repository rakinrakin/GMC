import * as THREE from 'three';
import { CONFIG } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import type { Stage } from './stage';

/** Extra break-up cards placed just in front of the F2 camera. */
export const FOREGROUND_CARDS = 10;

const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;
type Letter = (typeof LETTERS)[number];
/** Top-card texture weights: C top is cropped at its bottom edge, so keep it rare (< 15%). */
const TOP_WEIGHTS: Record<Letter, number> = { a: 0.22, b: 0.22, c: 0.12, d: 0.22, e: 0.22 };
const SIDE_WEIGHTS: Record<Letter, number> = { a: 0.2, b: 0.2, c: 0.2, d: 0.2, e: 0.2 };

const FLOOR_Y = 11.9;
const FLOOR_COLOR = '#B3BAC7';
const FLOOR_SIZE = 3000;
const NEAR_FADE: [number, number] = [2, 8];
const DRIFT_SPEED = 0.03;

const RENDER_ORDER = { floor: 0.9, deck: 1, breakup: 2, veil: 3 };

/** [x, y, z (Blender-style), width km]. */
export type CardPlacement = [number, number, number, number];

export interface CloudSet {
  group: THREE.Group;
  setOpacity(v: number): void;
  /** Number of placed card instances. */
  readonly count: number;
  /** Replace the cards of this set (Blender-style positions). Capacity-limited. */
  place(items: CardPlacement[]): void;
}

export interface Clouds {
  sets: { deck: CloudSet; breakup: CloudSet; veil: CloudSet };
  update(dtMs: number, camera: THREE.Camera): void;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling 2-channel value noise (two octaves) as a repeat-wrapped RG DataTexture. */
export function createNoiseTexture(seed = 1, size = 256): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(size * size * 2);
  const octaves = [
    { cells: 8, amp: 0.65 },
    { cells: 32, amp: 0.35 },
  ];
  const lattices = octaves.map((o) =>
    [0, 1].map(() => Float32Array.from({ length: o.cells * o.cells }, () => rnd())),
  );
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let ch = 0; ch < 2; ch++) {
        let v = 0;
        octaves.forEach((o, oi) => {
          const lat = lattices[oi][ch];
          const fx = (x / size) * o.cells;
          const fy = (y / size) * o.cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const x1 = (x0 + 1) % o.cells, y1 = (y0 + 1) % o.cells;
          const tx = fade(fx - x0), ty = fade(fy - y0);
          const a = lat[y0 * o.cells + x0], b = lat[y0 * o.cells + x1];
          const c = lat[y1 * o.cells + x0], d = lat[y1 * o.cells + x1];
          v += o.amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
        });
        data[(y * size + x) * 2 + ch] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  void main() {
    vUv = uv;
    vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vSeed = fract(center.xz * 0.0137);
    #ifdef BILLBOARD
      // Yaw-only billboard: the card stays upright and turns about world Y to face the camera.
      float w = length(instanceMatrix[0].xyz);
      vec3 toCam = cameraPosition - center.xyz;
      toCam.y = 0.0;
      vec3 f = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
      vec3 right = vec3(f.z, 0.0, -f.x);
      vec4 wp = vec4(center.xyz + right * position.x * w + vec3(0.0, 1.0, 0.0) * position.y * w, 1.0);
    #else
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #endif
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
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uNearFade;
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  void main() {
    #include <logdepthbuf_fragment>
    float s = uTime * ${DRIFT_SPEED.toFixed(3)};
    vec2 n1 = texture2D(uNoise, vUv * 0.9 + vSeed + vec2(s, s * 0.6)).rg;
    vec2 n2 = texture2D(uNoise, vUv * 2.3 + vSeed.yx - vec2(s * 0.7, s)).rg;
    vec2 uv = vUv + (n1 - 0.5) * 0.006 + (n2 - 0.5) * 0.012;
    // Map is premultiplied on upload so filtering does not fringe.
    vec4 tex = texture2D(uMap, uv);
    float a0 = tex.a;
    float n = 0.5 * (n1.r + n2.g);
    // Alpha erosion on the soft parts only (dense cores untouched).
    float a = a0 * (1.0 - (n - 0.5) * (1.0 - smoothstep(0.45, 1.0, a0)) * 4.0);
    a = clamp(a, 0.0, 1.0);
    // Soft card border: hides any crop edge in the texture.
    vec2 e = smoothstep(vec2(0.0), vec2(0.06), vUv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - vUv);
    a *= e.x * e.y;
    a *= smoothstep(uNearFade.x, uNearFade.y, vViewZ) * uOpacity;
    if (a < 0.002) discard;
    vec3 rgb = a0 > 1e-4 ? tex.rgb / a0 : vec3(1.0);
    gl_FragColor = vec4(rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

const floorVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

const floorFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorld;
  void main() {
    #include <logdepthbuf_fragment>
    // Fade out toward the plane edge so it meets the sky horizon without a line.
    float d = distance(vWorld.xz, cameraPosition.xz);
    float a = uOpacity * (1.0 - smoothstep(${(FLOOR_SIZE * 0.2).toFixed(1)}, ${(FLOOR_SIZE * 0.48).toFixed(1)}, d));
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Card {
  letter: Letter;
  pos: Vector3Tuple; // Blender-style
  width: number;
  yaw: number;
}

function pickLetter(rnd: () => number, weights: Record<Letter, number>): Letter {
  let r = rnd();
  for (const l of LETTERS) {
    r -= weights[l];
    if (r < 0) return l;
  }
  return LETTERS[LETTERS.length - 1];
}

/** Places cards by letter so each letter keeps close to its weight share (C top stays rare). */
function assignLetters(n: number, rnd: () => number, weights: Record<Letter, number>): Letter[] {
  const out: Letter[] = [];
  const counts: Record<Letter, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
  for (let i = 0; i < n; i++) {
    let l = pickLetter(rnd, weights);
    // Never let a letter exceed its share by more than one card.
    let guard = 0;
    while (counts[l] + 1 > Math.ceil(weights[l] * n) && guard++ < 10) l = pickLetter(rnd, weights);
    if (counts[l] + 1 > Math.ceil(weights[l] * n)) {
      l = LETTERS.reduce((best, x) => (counts[x] / weights[x] < counts[best] / weights[best] ? x : best), 'a' as Letter);
    }
    counts[l]++;
    out.push(l);
  }
  return out;
}

function deckCards(n: number, rnd: () => number): Card[] {
  const cam = CONFIG.timeline[0].pos; // F1
  const letters = assignLetters(n, rnd, SIDE_WEIGHTS);
  const cards: Card[] = [];
  const maxAngle = (62 * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const d = 8 + Math.pow(rnd(), 1.9) * 520;
    const ang = (rnd() * 2 - 1) * maxAngle;
    const w = (10 + rnd() * 10) * (0.45 + d / 220);
    const z = 11.3 + rnd() * 0.9 + 0.06 * w;
    cards.push({
      letter: letters[i],
      pos: [cam[0] + d * Math.sin(ang), cam[1] + d * Math.cos(ang), z],
      width: w,
      yaw: 0,
    });
  }
  return cards;
}

function breakupCards(n: number, nFore: number, rnd: () => number): Card[] {
  const letters = assignLetters(n + nFore, rnd, TOP_WEIGHTS);
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) {
    cards.push({
      letter: letters[i],
      pos: [-110 + rnd() * 210, -65 + rnd() * 155, 11.5 + rnd() * 4],
      width: 14 + rnd() * 20,
      yaw: rnd() * Math.PI * 2,
    });
  }
  // Foreground: along the F2 view ray, 7-18 km out, so they pass close under the descending camera.
  const f2 = CONFIG.timeline.find((k) => k.t === 0.45) ?? CONFIG.timeline[1];
  const dir = f2.target.map((v, i) => v - f2.pos[i]);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  for (let i = 0; i < nFore; i++) {
    const s = 7 + rnd() * 11;
    const lateral = (rnd() * 2 - 1) * 6;
    cards.push({
      letter: letters[n + i],
      pos: [
        f2.pos[0] + (dir[0] / len) * s + lateral,
        f2.pos[1] + (dir[1] / len) * s + (rnd() * 2 - 1) * 2,
        f2.pos[2] + (dir[2] / len) * s - 1 - rnd() * 2,
      ],
      width: 8 + rnd() * 8,
      yaw: rnd() * Math.PI * 2,
    });
  }
  return cards;
}

function buildSet(opts: {
  name: string;
  kind: 'side' | 'top';
  capacity: number;
  renderOrder: number;
  shared: { uTime: { value: number }; uNoise: { value: THREE.Texture } };
  loader: THREE.TextureLoader;
  anisotropy: number;
  /** Camera (Blender-style) the cards are sorted back-to-front against. */
  sortFrom: Vector3Tuple;
  rnd: () => number;
}): CloudSet & { opacity: { value: number }; _write(cards: Card[]): void } {
  const group = new THREE.Group();
  group.name = `clouds_${opts.name}`;
  const opacity = { value: 1 };
  const billboard = opts.kind === 'side';
  const meshes = new Map<Letter, THREE.InstancedMesh>();
  let count = 0;

  for (const l of LETTERS) {
    const url = `assets/cloud_${l}_${opts.kind}.webp`;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uNoise: opts.shared.uNoise,
        uTime: opts.shared.uTime,
        uOpacity: opacity,
        uNearFade: { value: new THREE.Vector2(...NEAR_FADE) },
      },
      defines: billboard ? { BILLBOARD: '' } : {},
      vertexShader,
      fragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(1, 0.5);
    if (!billboard) geometry.rotateX(-Math.PI / 2); // lie flat in XZ
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, opts.capacity));
    mesh.name = `${opts.name}_cloud_${l}_${opts.kind}`;
    mesh.count = 0;
    mesh.renderOrder = opts.renderOrder + LETTERS.indexOf(l) * 0.01;
    mesh.frustumCulled = false; // instances span the whole scene
    mesh.visible = false; // until its texture arrives
    meshes.set(l, mesh);
    group.add(mesh);

    const apply = (tex: THREE.Texture) => {
      const img = tex.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img?.height ? img.width / img.height : 2;
      const g = new THREE.PlaneGeometry(1, 1 / aspect);
      if (!billboard) g.rotateX(-Math.PI / 2);
      mesh.geometry.dispose();
      mesh.geometry = g;
      material.uniforms.uMap.value = tex;
      mesh.visible = true;
    };
    opts.loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.premultiplyAlpha = true;
      tex.anisotropy = opts.anisotropy;
      tex.needsUpdate = true;
      apply(tex);
    }, undefined, (err) => console.error(`Cloud texture failed: ${url}`, err));
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const sortFrom = new THREE.Vector3(...toThree(opts.sortFrom));

  const write = (cards: Card[]) => {
    const placed = cards.slice(0, opts.capacity);
    // Back to front from the set's spawn camera; each per-texture mesh keeps this order.
    const sorted = placed
      .map((c) => ({ c, d: new THREE.Vector3(...toThree(c.pos)).distanceToSquared(sortFrom) }))
      .sort((a, b) => b.d - a.d);
    for (const mesh of meshes.values()) mesh.count = 0;
    for (const { c } of sorted) {
      const mesh = meshes.get(c.letter)!;
      p.set(...toThree(c.pos));
      q.setFromAxisAngle(up, c.yaw);
      sc.set(c.width, c.width, c.width);
      m.compose(p, q, sc);
      mesh.setMatrixAt(mesh.count++, m);
    }
    for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true;
    count = placed.length;
    group.visible = opacity.value > 0 && count > 0;
  };

  const set = {
    group,
    opacity,
    get count() {
      return count;
    },
    setOpacity(v: number) {
      opacity.value = v;
      group.visible = v > 0 && count > 0;
    },
    place(items: CardPlacement[]) {
      const letters = assignLetters(Math.min(items.length, opts.capacity), opts.rnd,
        billboard ? SIDE_WEIGHTS : TOP_WEIGHTS);
      write(items.slice(0, opts.capacity).map(([x, y, z, w], i) => ({
        letter: letters[i],
        pos: [x, y, z] as Vector3Tuple,
        width: w,
        yaw: billboard ? 0 : opts.rnd() * Math.PI * 2,
      })));
    },
    _write: write,
  };
  return set;
}

export function createClouds(stage: Stage, seed = 7): Clouds {
  const mobile = stage.tier === 'mobile';
  const scale = mobile ? CONFIG.mobileCloudScale : 1;
  const nDeck = Math.round(CONFIG.clouds.deck * scale);
  const nBreak = Math.round(CONFIG.clouds.breakup * scale);
  const nFore = Math.round(FOREGROUND_CARDS * scale);

  const shared = { uTime: { value: 0 }, uNoise: { value: createNoiseTexture(seed) as THREE.Texture } };
  const loader = new THREE.TextureLoader();
  const anisotropy = stage.renderer?.capabilities.getMaxAnisotropy() ?? 1;
  const f1 = CONFIG.timeline[0].pos;
  const f2 = (CONFIG.timeline.find((k) => k.t === 0.45) ?? CONFIG.timeline[1]).pos;

  const common = { shared, loader, anisotropy };
  const deck = buildSet({ ...common, name: 'deck', kind: 'side', capacity: nDeck,
    renderOrder: RENDER_ORDER.deck, sortFrom: f1, rnd: mulberry32(seed) });
  const breakup = buildSet({ ...common, name: 'breakup', kind: 'top', capacity: nBreak + nFore,
    renderOrder: RENDER_ORDER.breakup, sortFrom: f2, rnd: mulberry32(seed + 1) });
  const veil = buildSet({ ...common, name: 'veil', kind: 'side', capacity: CONFIG.clouds.veil,
    renderOrder: RENDER_ORDER.veil, sortFrom: CONFIG.timeline[CONFIG.timeline.length - 1].pos,
    rnd: mulberry32(seed + 2) });

  deck._write(deckCards(nDeck, mulberry32(seed)));
  breakup._write(breakupCards(nBreak, nFore, mulberry32(seed + 1)));

  // Mist floor under the deck, fading with the deck.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(FLOOR_COLOR) }, uOpacity: deck.opacity },
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      transparent: true,
      depthWrite: false,
    }),
  );
  floor.name = 'cloud_floor';
  floor.geometry.rotateX(-Math.PI / 2);
  const [fx, , fz] = toThree(f1);
  floor.position.set(fx, FLOOR_Y, fz);
  floor.renderOrder = RENDER_ORDER.floor;
  floor.frustumCulled = false;
  deck.group.add(floor);

  stage.scene.add(deck.group, breakup.group, veil.group);

  return {
    sets: { deck, breakup, veil },
    update(dtMs: number, _camera: THREE.Camera) {
      shared.uTime.value += dtMs / 1000;
    },
  };
}
