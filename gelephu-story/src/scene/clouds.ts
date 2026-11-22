import * as THREE from 'three';
import { CONFIG } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import type { Stage } from './stage';

/** Extra break-up cards framing the F2 view (reference layout). */
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
/** Transparent rows between atlas slots so mips and filtering never bleed across textures. */
const ATLAS_PAD = 8;
/** Main top-card opacities and the foreground card opacity, from the reference layout. */
const TOP_OPACITIES = [0.85, 1.0];
const FOREGROUND_OPACITY = 0.95;

/**
 * Opening over GMC in the break-up field (Blender-style km). A main card is re-drawn if its centre
 * is inside the ellipse, or if more than maxFootprint of its ground footprint points (as seen from
 * the F2 camera) land inside it, so cards nearer the camera cannot cover the bowl by parallax.
 */
export const GMC_GAP = {
  center: [-2, -2] as [number, number],
  semiAxes: [42, 16] as [number, number],
  groundZ: 0.6,
  maxFootprint: 0.3,
};

const F2_KEY = CONFIG.timeline.find((k) => k.t === 0.45) ?? CONFIG.timeline[1];

function inEllipse(x: number, y: number): boolean {
  const [cx, cy] = GMC_GAP.center;
  const [a, b] = GMC_GAP.semiAxes;
  return ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
}

/**
 * Ground points (z = GMC_GAP.groundZ) hit by rays from the F2 camera through a card's centre and
 * its edge points at +-W/2 along the camera's horizontal view direction (near, far) and across it
 * (left, right). Order: centre, near, far, left, right. Blender-style coords.
 */
export function footprintPoints(x: number, y: number, z: number, w: number): Array<[number, number]> {
  const [px, py, pz] = F2_KEY.pos;
  let fx = F2_KEY.target[0] - px, fy = F2_KEY.target[1] - py;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl; fy /= fl;
  const rx = fy, ry = -fx; // right of the view direction
  const h = w / 2;
  const pts: Array<[number, number]> = [
    [x, y], [x - fx * h, y - fy * h], [x + fx * h, y + fy * h], [x - rx * h, y - ry * h], [x + rx * h, y + ry * h],
  ];
  const s = (pz - GMC_GAP.groundZ) / Math.max(pz - z, 1e-3);
  return pts.map(([qx, qy]) => [px + (qx - px) * s, py + (qy - py) * s]);
}

/** True if a card (Blender-style centre x, y, z, width w) would cover the GMC gap. */
export function inGmcGap(x: number, y: number, z: number, w: number): boolean {
  if (inEllipse(x, y)) return true;
  const pts = footprintPoints(x, y, z, w);
  const inside = pts.filter(([qx, qy]) => inEllipse(qx, qy)).length;
  return inside / pts.length > GMC_GAP.maxFootprint;
}

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

export interface AtlasLayout {
  width: number;
  height: number;
  /** Per texture, in pixels: [x, top row, width, height]. */
  slots: Array<[number, number, number, number]>;
  /** Per texture, normalised: [u0, v0 (top row, row 0 = v 0), du, dv]. */
  rects: Array<[number, number, number, number]>;
  /** Per texture: width / height. */
  aspects: number[];
}

/** Textures stacked vertically, left-aligned, with pad rows between them. */
export function atlasLayout(sizes: Array<{ width: number; height: number }>, pad = ATLAS_PAD): AtlasLayout {
  const width = Math.max(...sizes.map((s) => s.width));
  const slots: AtlasLayout['slots'] = [];
  let y = 0;
  sizes.forEach((s, i) => {
    slots.push([0, y, s.width, s.height]);
    y += s.height + (i < sizes.length - 1 ? pad : 0);
  });
  const height = y;
  return {
    width,
    height,
    slots,
    rects: slots.map(([x, top, w, h]) => [x / width, top / height, w / width, h / height]),
    aspects: sizes.map((s) => s.width / s.height),
  };
}

/**
 * Builds a straight-alpha RGBA atlas. Canvas readback loses colour where alpha is ~0, so those
 * texels are refilled from their neighbours (a few dilation passes) and then with the mean cloud
 * colour. Bilinear filtering and mips then blend toward light cloud colour, never toward black.
 */
function buildAtlasTexture(images: CanvasImageSource[], layout: AtlasLayout): THREE.Texture {
  const { width, height } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  layout.slots.forEach(([x, y], i) => ctx.drawImage(images[i], x, y));
  const px = ctx.getImageData(0, 0, width, height).data;

  const EMPTY = 8;
  const filled = new Uint8Array(width * height);
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let i = 0; i < width * height; i++) {
    if (px[i * 4 + 3] >= EMPTY) {
      filled[i] = 1;
      if (px[i * 4 + 3] > 128) {
        sr += px[i * 4]; sg += px[i * 4 + 1]; sb += px[i * 4 + 2]; sn++;
      }
    }
  }
  const next = new Uint8Array(filled);
  for (let pass = 0; pass < 6; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        const add = (j: number) => {
          if (filled[j]) { r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++; }
        };
        if (x > 0) add(i - 1);
        if (x < width - 1) add(i + 1);
        if (y > 0) add(i - width);
        if (y < height - 1) add(i + width);
        if (n) {
          px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n;
          next[i] = 1;
        }
      }
    }
    filled.set(next);
  }
  const mean = sn ? [sr / sn, sg / sn, sb / sn] : [220, 222, 226];
  for (let i = 0; i < width * height; i++) {
    if (!filled[i]) {
      px[i * 4] = mean[0]; px[i * 4 + 1] = mean[1]; px[i * 4 + 2] = mean[2];
    }
  }

  const tex = new THREE.DataTexture(new Uint8Array(px.buffer), width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.flipY = false; // row 0 (image top) sits at v = 0; the shader flips
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

interface Atlas {
  uMap: { value: THREE.Texture };
  uRects: { value: THREE.Vector4[] };
  uAspects: { value: number[] };
  onReady(cb: () => void): void;
}

function loadAtlas(kind: 'side' | 'top', loader: THREE.TextureLoader, anisotropy: number): Atlas {
  const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  placeholder.premultiplyAlpha = false;
  placeholder.needsUpdate = true;
  const waiting: Array<() => void> = [];
  let ready = false;
  const atlas: Atlas = {
    uMap: { value: placeholder },
    uRects: { value: LETTERS.map(() => new THREE.Vector4(0, 0, 1, 1)) },
    uAspects: { value: LETTERS.map(() => 2) },
    onReady(cb) {
      if (ready) cb();
      else waiting.push(cb);
    },
  };
  const texs: THREE.Texture[] = [];
  let pending = LETTERS.length;
  const finish = () => {
    const images = texs.map((t) => t.image as CanvasImageSource & { width: number; height: number });
    const layout = atlasLayout(images.map((im) => ({ width: im.width, height: im.height })));
    layout.rects.forEach((r, i) => atlas.uRects.value[i].set(...r));
    layout.aspects.forEach((a, i) => (atlas.uAspects.value[i] = a));
    // No DOM (unit tests): keep the placeholder texture; layout and aspects are still real.
    if (typeof document !== 'undefined') {
      const tex = buildAtlasTexture(images, layout);
      tex.anisotropy = anisotropy;
      atlas.uMap.value = tex;
    }
    texs.forEach((t) => t.dispose());
    ready = true;
    waiting.splice(0).forEach((cb) => cb());
  };
  LETTERS.forEach((l, i) => {
    const url = `assets/cloud_${l}_${kind}.webp`;
    loader.load(
      url,
      (tex) => {
        texs[i] = tex;
        if (--pending === 0) finish();
      },
      undefined,
      (err) => console.error(`Cloud texture failed: ${url}`, err),
    );
  });
  return atlas;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uAspects[5];
  attribute vec2 aCard; // x: texture index, y: card opacity
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  varying float vCardOpacity;
  flat varying int vTex;
  void main() {
    vUv = uv;
    int ti = int(aCard.x + 0.5);
    vTex = ti;
    vCardOpacity = aCard.y;
    float h = 1.0 / uAspects[ti];
    vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vSeed = fract(center.xz * 0.0137);
    #ifdef BILLBOARD
      // Yaw-only billboard: the card stays upright and turns about world Y to face the camera.
      float w = length(instanceMatrix[0].xyz);
      vec3 toCam = cameraPosition - center.xyz;
      toCam.y = 0.0;
      vec3 f = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
      vec3 right = vec3(f.z, 0.0, -f.x);
      vec4 wp = vec4(center.xyz + right * position.x * w + vec3(0.0, position.y * h * w, 0.0), 1.0);
    #else
      // Flat in local XZ; the card's image top points to local -Z (north before yaw).
      vec4 wp = modelMatrix * instanceMatrix * vec4(position.x, 0.0, -position.y * h, 1.0);
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
  uniform vec4 uRects[5];
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uNearFade;
  varying vec2 vUv;
  varying vec2 vSeed;
  varying float vViewZ;
  varying float vCardOpacity;
  flat varying int vTex;
  void main() {
    #include <logdepthbuf_fragment>
    float s = uTime * ${DRIFT_SPEED.toFixed(3)};
    vec2 n1 = texture2D(uNoise, vUv * 0.9 + vSeed + vec2(s, s * 0.6)).rg;
    vec2 n2 = texture2D(uNoise, vUv * 2.3 + vSeed.yx - vec2(s * 0.7, s)).rg;
    vec2 uv = clamp(vUv + (n1 - 0.5) * 0.006 + (n2 - 0.5) * 0.012, 0.0, 1.0);
    vec4 r = uRects[vTex];
    // Atlas row 0 is the image top, so card v = 1 maps to the slot's first row.
    vec4 tex = texture2D(uMap, vec2(r.x + uv.x * r.z, r.y + (1.0 - uv.y) * r.w));
    float a0 = tex.a;
    float n = 0.5 * (n1.r + n2.g);
    // Alpha erosion on the soft parts only (dense cores untouched).
    float a = clamp(a0 * (1.0 - (n - 0.5) * (1.0 - smoothstep(0.45, 1.0, a0)) * 4.0), 0.0, 1.0);
    // Soft card border: hides any crop edge in the texture.
    vec2 e = smoothstep(vec2(0.0), vec2(0.06), vUv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - vUv);
    a *= e.x * e.y;
    a *= smoothstep(uNearFade.x, uNearFade.y, vViewZ) * uOpacity * vCardOpacity;
    if (a < 0.002) discard;
    // Straight-alpha colour; premultiplied once, after the output encode.
    gl_FragColor = vec4(tex.rgb, a);
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
  opacity: number;
}

function pickLetter(rnd: () => number, weights: Record<Letter, number>): Letter {
  let r = rnd();
  for (const l of LETTERS) {
    r -= weights[l];
    if (r < 0) return l;
  }
  return LETTERS[LETTERS.length - 1];
}

/** Picks letters by weight, capping each letter at its share (C top stays rare). */
function assignLetters(n: number, rnd: () => number, weights: Record<Letter, number>): Letter[] {
  const out: Letter[] = [];
  const counts: Record<Letter, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
  const cap = (l: Letter) => Math.ceil(weights[l] * n);
  for (let i = 0; i < n; i++) {
    let l = pickLetter(rnd, weights);
    let guard = 0;
    while (counts[l] + 1 > cap(l) && guard++ < 10) l = pickLetter(rnd, weights);
    if (counts[l] + 1 > cap(l)) {
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
  const maxAngle = (62 * Math.PI) / 180;
  return letters.map((letter) => {
    const d = 8 + Math.pow(rnd(), 1.9) * 520;
    const ang = (rnd() * 2 - 1) * maxAngle;
    const w = (10 + rnd() * 10) * (0.45 + d / 220);
    const z = 11.3 + rnd() * 0.9 + 0.06 * w;
    return { letter, pos: [cam[0] + d * Math.sin(ang), cam[1] + d * Math.cos(ang), z], width: w, yaw: 0, opacity: 1 };
  });
}

function breakupCards(n: number, nFore: number, rnd: () => number): Card[] {
  const letters = assignLetters(n + nFore, rnd, TOP_WEIGHTS);
  const u = (a: number, b: number) => a + rnd() * (b - a);
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) {
    // Re-draw (seeded, so still deterministic) until the card stays out of the GMC gap.
    let x: number, y: number, z: number, w: number;
    do {
      x = u(-110, 100);
      y = u(-65, 90);
      z = u(11.5, 15.5);
      w = u(14, 34);
    } while (inGmcGap(x, y, z, w));
    cards.push({
      letter: letters[i],
      pos: [x, y, z],
      width: w,
      yaw: rnd() * Math.PI * 2,
      opacity: TOP_OPACITIES[Math.floor(rnd() * TOP_OPACITIES.length)],
    });
  }
  // Foreground, reference layout: either side of the F2 view (x = -4 +- 9..16), leaving the
  // centre open so GMC shows through.
  for (let i = 0; i < nFore; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    cards.push({
      letter: letters[n + i],
      pos: [-4 + side * u(9, 16), u(-55, -40), u(21, 25)],
      width: u(10, 16),
      yaw: rnd() * Math.PI * 2,
      opacity: FOREGROUND_OPACITY,
    });
  }
  return cards;
}

function buildSet(opts: {
  name: string;
  billboard: boolean;
  capacity: number;
  renderOrder: number;
  atlas: Atlas;
  shared: { uTime: { value: number }; uNoise: { value: THREE.Texture } };
  /** Camera (Blender-style) the cards are sorted back-to-front against. */
  sortFrom: Vector3Tuple;
  rnd: () => number;
}): CloudSet & { opacity: { value: number }; write(cards: Card[]): void } {
  const group = new THREE.Group();
  group.name = `clouds_${opts.name}`;
  const opacity = { value: 1 };
  const cap = Math.max(1, opts.capacity);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const aCard = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  geometry.setAttribute('aCard', aCard);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: opts.atlas.uMap,
      uRects: opts.atlas.uRects,
      uAspects: opts.atlas.uAspects,
      uNoise: opts.shared.uNoise,
      uTime: opts.shared.uTime,
      uOpacity: opacity,
      uNearFade: { value: new THREE.Vector2(...NEAR_FADE) },
    },
    defines: opts.billboard ? { BILLBOARD: '' } : {},
    vertexShader,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.name = `clouds_${opts.name}_cards`;
  mesh.count = 0;
  mesh.renderOrder = opts.renderOrder;
  mesh.frustumCulled = false; // instances span the whole scene
  mesh.visible = false; // until the atlas arrives
  opts.atlas.onReady(() => (mesh.visible = true));
  group.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const sortFrom = new THREE.Vector3(...toThree(opts.sortFrom));
  let count = 0;

  const write = (cards: Card[]) => {
    // One mesh per set, so this back-to-front order (from the spawn camera) holds across textures.
    const sorted = cards
      .slice(0, opts.capacity)
      .map((c) => ({ c, d: p.set(...toThree(c.pos)).distanceToSquared(sortFrom) }))
      .sort((a, b) => b.d - a.d);
    sorted.forEach(({ c }, i) => {
      p.set(...toThree(c.pos));
      q.setFromAxisAngle(up, c.yaw);
      sc.set(c.width, c.width, c.width);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      aCard.setXY(i, LETTERS.indexOf(c.letter), c.opacity);
    });
    mesh.count = count = sorted.length;
    mesh.instanceMatrix.needsUpdate = true;
    aCard.needsUpdate = true;
    group.visible = opacity.value > 0 && count > 0;
  };

  return {
    group,
    opacity,
    write,
    get count() {
      return count;
    },
    setOpacity(v: number) {
      opacity.value = v;
      group.visible = v > 0 && count > 0;
    },
    place(items: CardPlacement[]) {
      const n = Math.min(items.length, opts.capacity);
      const letters = assignLetters(n, opts.rnd, opts.billboard ? SIDE_WEIGHTS : TOP_WEIGHTS);
      write(items.slice(0, n).map(([x, y, z, w], i) => ({
        letter: letters[i],
        pos: [x, y, z] as Vector3Tuple,
        width: w,
        yaw: opts.billboard ? 0 : opts.rnd() * Math.PI * 2,
        opacity: 1,
      })));
    },
  };
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
  const sideAtlas = loadAtlas('side', loader, anisotropy);
  const topAtlas = loadAtlas('top', loader, anisotropy);
  const f1 = CONFIG.timeline[0].pos;
  const f2 = (CONFIG.timeline.find((k) => k.t === 0.45) ?? CONFIG.timeline[1]).pos;

  const deck = buildSet({ name: 'deck', billboard: true, capacity: nDeck, renderOrder: RENDER_ORDER.deck,
    atlas: sideAtlas, shared, sortFrom: f1, rnd: mulberry32(seed) });
  const breakup = buildSet({ name: 'breakup', billboard: false, capacity: nBreak + nFore,
    renderOrder: RENDER_ORDER.breakup, atlas: topAtlas, shared, sortFrom: f2, rnd: mulberry32(seed + 1) });
  const veil = buildSet({ name: 'veil', billboard: true, capacity: CONFIG.clouds.veil,
    renderOrder: RENDER_ORDER.veil, atlas: sideAtlas, shared,
    sortFrom: CONFIG.timeline[CONFIG.timeline.length - 1].pos, rnd: mulberry32(seed + 2) });

  deck.write(deckCards(nDeck, mulberry32(seed)));
  breakup.write(breakupCards(nBreak, nFore, mulberry32(seed + 1)));

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
    update(dtMs: number) {
      shared.uTime.value += dtMs / 1000;
    },
  };
}
