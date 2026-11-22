// ─────────────────────────────────────────────────────────────────────────────
// GMC shared 3D kit · v1.0.0
// The single source of truth in code for design.md: colour tokens, procedural
// textures, the M_* material library, the DUSK/DAY lighting rig, background,
// renderer + post, a review stage, and hand-off helpers (validator, GLB export).
//
// Both designers import this file. Never copy values out of it into a model:
// import them, so a change here reaches every model.
//
// three.js 0.160.0 via importmap:  "three" + "three/addons/"
// Units: 1 unit = 1 metre. Axes: +Y up, −Z north, +X east (design.md §8).
// UV convention: UVs are in METRES. Every texture knows its real tile size, so
// a 0.3 m shingle is 0.3 m on every model. Use metricUV() on geometries whose
// built-in UVs are 0..1 (Box, RoundedBox, Cylinder, Lathe, Sphere...).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const KIT_VERSION = '1.2.0';   // 1.2.0: + M_glulam · 1.1.0: + M_steel_dark, clay keeps hidden meshes hidden
export const SEED = 1337;

// ═════════════════════════════════════════════════════════════ 1. TOKENS ════
// design.md §2. Core tokens are Yoeja's exact CSS values; the rest are derived.
export const TOKENS = Object.freeze({
  // core (Yoeja)
  night: 0x0b0e18, umber: 0x18130f, umberEarth: 0x221208, umberDeep: 0x180c05,
  maroon: 0x6d0033, saffron: 0xfe6417, marigold: 0xffb978, honey: 0xffc450,
  glowCream: 0xfff3dc, sand: 0xefece6, stone: 0x7a736a, forest: 0x2f4a38,
  sky: 0x0081c4, skyLight: 0x7cc8f2,
  // materials (derived from BIG renders)
  timberCedar: 0x8a5a3c, timberDark: 0x5e4130, bamboo: 0xc9a46a, slateRoof: 0x3a3b40,
  canopyMid: 0x3e5a3a, canopyLight: 0x6e8a4c, paddyYoung: 0xa9b865, paddyGold: 0xc8b46a,
  paddyWater: 0x5e7f86, riverWater: 0x2c5560, gravel: 0xb8b0a2, mist: 0xc9cfd6,
  textileMadder: 0x9c2f3a, textileSlate: 0x4a5c7a, textileRose: 0xc98a86, textileCharcoal: 0x2b2a31,
  gold: 0xf0c86a,
  // prayer flags (traditional order)
  flagBlue: 0x2e5fa8, flagWhite: 0xf4f1ea, flagRed: 0xb8322a, flagGreen: 0x3e8e4e, flagYellow: 0xe8b931,
});
// Yoeja's warm glow ramp, light → deep. The ONLY colours allowed in emissive gradients.
export const GLOW_RAMP = Object.freeze([0xfff8ec, 0xfff3dc, 0xffd28c, 0xffc450, 0xffaa3c, 0xfe7828]);

// ══════════════════════════════════════════════════════════════ 2. MOODS ════
// design.md §4. Exactly two moods. Never tune per model.
export const MOODS = Object.freeze({
  dusk: {
    key: { color: TOKENS.marigold, intensity: 3.0, azimuth: 255, elevation: 18 },
    hemi: { sky: 0x3a4a6e, ground: 0x221208, intensity: 0.9 },
    envIntensity: 0.85, exposure: 1.05,
    bloom: { strength: 0.32, radius: 0.5, threshold: 0.9 },
    glow: { color: TOKENS.honey, scale: 2.2 },          // HDR so bloom catches it
    fog: { color: 0x1a1d2a, density: 0.00004 },
    background: { top: 0x0b0e18, bottom: 0x18130f, mist: 0xc9cfd6 },
  },
  day: {
    key: { color: TOKENS.glowCream, intensity: 3.2, azimuth: 215, elevation: 45 },
    hemi: { sky: 0xdfe6ee, ground: 0x7a736a, intensity: 0.9 },
    envIntensity: 1.0, exposure: 1.05,
    bloom: { strength: 0.12, radius: 0.4, threshold: 0.97 },
    glow: { color: 0x2a241f, scale: 1.0 },              // unlit interior tone
    fog: { color: 0xc9cfd6, density: 0.00003 },
    background: { top: 0xdce1e6, bottom: 0xb9bec2, mist: 0xffffff },
  },
});

const DEG = Math.PI / 180;
/** Unit vector from the target toward the sun. Azimuth clockwise from north (−Z). */
export function sunDirection(azimuthDeg, elevationDeg) {
  const a = azimuthDeg * DEG, e = elevationDeg * DEG;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// ═════════════════════════════════════════════════════ 3. NOISE + CANVAS ════
export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/**
 * Seeded value noise. noise(x,y,px,py) tiles with period px/py when given.
 * tfbm(u,v,fx,fy,oct) is fbm over the unit square that tiles seamlessly
 * (fx, fy must be integers). fbm(x,y,oct) is the skill's plain fbm.
 */
export function createNoise(seed = SEED) {
  const rnd = mulberry(seed), perm = new Uint16Array(512), grad = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) grad[i] = rnd() * 2 - 1;
  const lat = (x, y, px, py) => {
    if (px) x = ((x % px) + px) % px;
    if (py) y = ((y % py) + py) % py;
    return grad[perm[(x & 255) + perm[y & 255]]];
  };
  function noise(x, y, px = 0, py = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = lat(xi, yi, px, py), b = lat(xi + 1, yi, px, py), c = lat(xi, yi + 1, px, py), d = lat(xi + 1, yi + 1, px, py);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
  function tfbm(u, v, fx, fy, o = 4) {
    let s = 0, a = .5, f = 1;
    for (let i = 0; i < o; i++) { s += a * noise(u * fx * f + i * 31.7, v * fy * f + i * 11.3, fx * f, fy * f); f *= 2; a *= .5; }
    return s;
  }
  const hash = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + seed, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  return { rnd, noise, fbm, tfbm, hash };
}

/** Paint a canvas per pixel. fn(x,y,i) returns [r,g,b] or [r,g,b,a] in 0..255. */
export function paint(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4, col = fn(x, y, i);
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3] ?? 255;
  }
  g.putImageData(im, 0, 0); return c;
}
/** Height field (Float32Array w*h) → tangent-space normal map canvas. Wraps at edges. */
export function heightToNormal(H, w, h, s) {
  return paint(w, h, (x, y) => {
    const l = H[y * w + (x - 1 + w) % w], r = H[y * w + (x + 1) % w], u = H[((y - 1 + h) % h) * w + x], dn = H[((y + 1) % h) * w + x];
    const nx = (l - r) * s, ny = (dn - u) * s, il = 1 / Math.hypot(nx, ny, 1);
    return [(nx * il * .5 + .5) * 255, (ny * il * .5 + .5) * 255, (il * .5 + .5) * 255];
  });
}
const rgb = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const grey = v => { const g = clamp(v) * 255; return [g, g, g]; };

// ══════════════════════════════════════════════════ 4. TEXTURE RECIPES ══════
// Each recipe returns { map, normal, rough, tile:[uMetres, vMetres], bump }.
// Canvases only; createMaterials() turns them into textures. All tile seamlessly.
export const RECIPES = {
  /** Timber. Grain runs along U. Skill wood recipe, made tileable. */
  wood(N, S, { dark = 0x5e4130, light = 0xa8754e, lines = 22, warp = .22, contrast = 1.0, pore = .08, bump = 2.0, tile = 2 } = {}) {
    const H = new Float32Array(S * S), R = new Float32Array(S * S), D = rgb(dark), L = rgb(light);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S;
      const w = N.tfbm(u, v, 3, 12, 3) * warp;
      const ring = Math.pow(.5 + .5 * Math.sin(2 * Math.PI * (lines * v + w) + N.tfbm(u, v, 2, 4, 2) * 5), contrast);
      const fib = .5 + .5 * N.tfbm(u, v, 6, 160, 2);
      let t = ring * .68 + fib * .32;
      const pr = N.noise(u * 48 + 50, v * 400, 48, 400) > .55 ? pore : 0;
      t = clamp(t - pr);
      H[i] = t; R[i] = .55 + (1 - t) * .12 + pr * 1.2;
      return mix(D, L, t);
    });
    return { map, normal: heightToNormal(H, S, S, bump), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /**
   * Glued-laminated timber: grain along U, lamellae (~45 mm) stacked across V with thin
   * dark glue lines and a tone shift per lamella. Tile 1.2 m along the member × 0.6 m across.
   */
  glulam(N, S, { dark = 0x2e2017, light = 0x664833, tile = .6, lam = .046 } = {}) {
    const n = Math.round(tile / lam), D = rgb(dark), L = rgb(light), H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, lv = v * n, li = Math.floor(lv), f = lv - li;
      const glue = Math.min(f, 1 - f) < .05, tone = .78 + N.hash(li, 5) * .44;
      const grain = .5 + .5 * Math.sin(2 * Math.PI * (v * n * 3 + N.tfbm(u, v, 3, n * 2, 3) * 1.4));
      const fib = .5 + .5 * N.tfbm(u, v, 4, 160, 2), knot = Math.max(0, N.tfbm(u, v, 6, n, 2) - .32) * 2.5;
      const t = clamp((grain * .5 + fib * .5) * tone - knot * .35);
      H[i] = glue ? 0 : .75 + t * .25; R[i] = glue ? .82 : .56 + (1 - t) * .12;
      return glue ? shade(D, .55) : mix(D, L, t * .85);
    });
    return { map, normal: heightToNormal(H, S, S, 2.5), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile * 2, tile] };
  },

  /** Lime-wash: vertical streaks (V = up on walls) + soft mottling, ±4 %. */
  lime(N, S, { base = TOKENS.sand, tile = 4 } = {}) {
    const H = new Float32Array(S * S), B = rgb(base), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S;
      const streak = N.tfbm(u, v, 22, 2, 3), mott = N.tfbm(u, v, 6, 6, 4), fine = N.tfbm(u, v, 64, 64, 2);
      const k = 1 + clamp(streak * .05 + mott * .035 + fine * .012, -.04, .04);
      H[i] = mott * .6 + fine * .4; R[i] = .9 + fine * .05;
      const c = shade(B, k); return [c[0], c[1] * (1 - streak * .006), c[2] * (1 - streak * .012)];
    });
    return { map, normal: heightToNormal(H, S, S, 1.2), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Coursed stone masonry, blocks 0.4–0.9 m, 2 cm mortar. */
  stone(N, S, { base = TOKENS.stone, mortar = 0x5c564f, tile = 4 } = {}) {
    const rows = 6, rnd = mulberry(SEED + 7), Hs = [];
    let acc = 0; for (let r = 0; r < rows; r++) { const h = .7 + rnd() * .6; Hs.push(h); acc += h; }
    const rowEdge = [0]; Hs.forEach(h => rowEdge.push(rowEdge[rowEdge.length - 1] + h / acc));
    const rowBlocks = Hs.map(() => {
      const lens = []; let s = 0; while (s < 1) { const l = (.4 + rnd() * .5) / tile; lens.push(l); s += l; }
      const k = 1 / s, off = rnd(), edges = []; let e = off; lens.forEach(l => { edges.push(e % 1); e += l * k; });
      return edges.sort((a, b) => a - b);
    });
    const mw = .02 / tile, B = rgb(base), M = rgb(mortar), H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S; let r = 0; while (r < rows - 1 && v >= rowEdge[r + 1]) r++;
      const E = rowBlocks[r]; let b = E.length - 1; for (let j = 0; j < E.length; j++) if (u >= E[j]) b = j;
      const left = E[b], right = b + 1 < E.length ? E[b + 1] : E[0] + 1;
      const uu = u < left ? u + 1 : u;
      const d = Math.min(uu - left, right - uu, v - rowEdge[r], rowEdge[r + 1] - v);
      const surf = N.tfbm(u, v, 16, 16, 3), tone = 1 + (N.hash(r, b) - .5) * .16;
      const h = d < mw ? 0 : sstep(mw, mw + .006, d) * (.85 + surf * .3);
      H[i] = h; R[i] = d < mw ? .95 : .84 + surf * .06;
      return d < mw ? shade(M, 1 + surf * .1) : shade(B, tone * (1 + surf * .12));
    });
    return { map, normal: heightToNormal(H, S, S, 6), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Overlapping shingles, 0.3 m rows (8 rows per 2.4 m), staggered. Rows run along U. */
  shingle(N, S, { base = TOKENS.slateRoof, tile = 2.4 } = {}) {
    const rows = 8, cols = 8, B = rgb(base), H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, rv = v * rows, r = Math.floor(rv), fv = rv - r;
      const cu = u * cols + (r % 2) * .5, c = Math.floor(cu), fu = cu - c;
      const gap = Math.min(fu, 1 - fu) < .03, tone = 1 + (N.hash(r, ((c % cols) + cols) % cols) - .5) * .18;
      const surf = N.tfbm(u, v, 24, 24, 2);
      H[i] = gap ? 0 : (1 - fv) * .9 + surf * .1; R[i] = gap ? .8 : .5 + surf * .08;
      return gap ? shade(B, .45) : shade(B, tone * (.82 + (1 - fv) * .25));
    });
    return { map, normal: heightToNormal(H, S, S, 4), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Vertical bamboo slats, 8 cm, nodes every 0.4 m. Slats run along V (up). */
  bamboo(N, S, { base = TOKENS.bamboo, tile = 1.2 } = {}) {
    const slats = 15, B = rgb(base), G = rgb(TOKENS.umber), H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, su = u * slats, s = Math.floor(su), fu = su - s;
      if (fu > .86) { H[i] = 0; R[i] = .9; return G; }
      const lu = fu / .86, prof = Math.sin(Math.PI * lu);
      const nv = (v * 3 + N.hash(s, 3)) % 1, node = Math.exp(-Math.pow(Math.min(nv, 1 - nv) / .012, 2));
      const fib = N.tfbm(u, v, 120, 3, 2), tone = 1 + (N.hash(s, 9) - .5) * .14;
      H[i] = prof * .8 + node * .35 + fib * .05; R[i] = .46 + node * .1 + fib * .04;
      return shade(B, tone * (.86 + prof * .16 - node * .18 + fib * .05));
    });
    return { map, normal: heightToNormal(H, S, S, 3), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Temple-Dam diamond tiles in the 4 textile colours (madder 35 / slate 30 / rose 20 / charcoal 15). */
  textile(N, S, { diamond = 4, count = 16 } = {}) {
    const C = [TOKENS.textileMadder, TOKENS.textileSlate, TOKENS.textileRose, TOKENS.textileCharcoal].map(rgb);
    const W = [.35, .65, .85, 1], H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, p = (u + v) * count, q = (u - v) * count;
      const ip = Math.floor(p), iq = Math.floor(q), fp = p - ip, fq = q - iq;
      const h = N.hash(((ip % count) + count) % count, ((iq % count) + count) % count);
      const col = C[W.findIndex(w => h < w)];
      const e = Math.min(fp, 1 - fp, fq, 1 - fq), bev = sstep(0, .08, e), surf = N.tfbm(u, v, 48, 48, 2);
      H[i] = bev * .9 + surf * .1; R[i] = e < .02 ? .8 : .42 + surf * .05;
      return e < .02 ? shade(C[3], .7) : shade(col, (.9 + bev * .1) * (1 + surf * .08 + (N.hash(ip, iq) - .5) * .08));
    });
    const t = diamond * count; return { map, normal: heightToNormal(H, S, S, 3), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [t, t] };
  },

  /** Painted bands for bracket ends & trim: sand / maroon / saffron with dark separators. Bands vary along V. */
  painted(N, S, { tile = .6 } = {}) {
    const bands = [[.0, TOKENS.sand], [.2, TOKENS.maroon], [.52, TOKENS.saffron], [.66, TOKENS.sand], [.78, TOKENS.timberDark], [1, 0]];
    const H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S; let b = 0; while (v >= bands[b + 1][0]) b++;
      const edge = Math.min(v - bands[b][0], bands[b + 1][0] - v), sep = edge < .008;
      const grain = N.tfbm(u, v, 4, 40, 2);
      H[i] = sep ? 0 : .6 + grain * .1; R[i] = sep ? .7 : .5 + grain * .05;
      return sep ? rgb(0x1c140f) : shade(rgb(bands[b][1]), 1 + grain * .06);
    });
    return { map, normal: heightToNormal(H, S, S, 2), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Beam-end medallion decal (not tiling; UV 0..1 across the disc). Alpha-tested. */
  medallion(N, S) {
    const G = rgb(TOKENS.gold), M = rgb(TOKENS.maroon), F = rgb(TOKENS.saffron), D = rgb(TOKENS.sand);
    const H = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const dx = x / S - .5, dy = y / S - .5, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      let c, h = .6;
      if (r < .1) { c = G; h = 1; } else if (r < .17) c = M;
      else if (r < .2) c = D;
      else if (r < .36) { const pet = Math.cos(th * 8) > ((r - .2) / .16) * 2 - 1; c = pet ? F : M; h = pet ? .8 : .5; }
      else if (r < .4) c = D; else if (r < .47) c = M; else { H[i] = 0; return [0, 0, 0, 0]; }
      H[i] = h; return [...c, 255];
    });
    return { map, normal: heightToNormal(H, S, S, 2), rough: null, tile: [1, 1], decal: true };
  },

  /** Paddy rows (along U) every 0.25 m + a bund at the tile edge. */
  paddy(N, S, { base = TOKENS.paddyYoung, flooded = false, tile = 4 } = {}) {
    const B = rgb(base), W = rgb(TOKENS.paddyWater), BU = rgb(0x8c8a5a), H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, row = .5 + .5 * Math.sin(2 * Math.PI * 16 * v + N.tfbm(u, v, 3, 2, 2) * 2);
      const patch = N.tfbm(u, v, 5, 5, 3), bund = Math.min(v, 1 - v) < .012;
      if (bund) { H[i] = 1; R[i] = .9; return shade(BU, 1 + patch * .1); }
      if (flooded) { H[i] = row * .15; R[i] = .12 + row * .3; return mix(W, shade(B, .8), row * .35); }
      H[i] = row * .5 + patch * .2; R[i] = .78 + patch * .05;
      return shade(B, (.86 + row * .16) * (1 + patch * .1));
    });
    return { map, normal: heightToNormal(H, S, S, flooded ? 1 : 2.5), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** River gravel: cellular pebbles. */
  gravel(N, S, { base = TOKENS.gravel, tile = 2 } = {}) {
    const G = 28, B = rgb(base), ST = rgb(TOKENS.stone), H = new Float32Array(S * S);
    const pt = (cx, cy) => { const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G; return [cx + .15 + N.hash(wx, wy) * .7, cy + .15 + N.hash(wy + 99, wx) * .7, N.hash(wx * 7, wy * 13)]; };
    const map = paint(S, S, (x, y, i) => {
      const px = x / S * G, py = y / S * G, cx = Math.floor(px), cy = Math.floor(py);
      let d1 = 9, d2 = 9, id = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const p = pt(cx + ox, cy + oy), d = Math.hypot(px - p[0], py - p[1]);
        if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d;
      }
      const e = sstep(0, .35, d2 - d1); H[i] = e * (1 - d1 * .5);
      return shade(mix(B, ST, id < .2 ? .6 : id * .25), .72 + e * .32);
    });
    return { map, normal: heightToNormal(H, S, S, 5), rough: null, tile: [tile, tile] };
  },

  /** Brushed-metal roughness streaks along U (structural steel connectors, rails). */
  brushed(N, S, { tile = 1 } = {}) {
    const rough = paint(S, S, (x, y) => { const u = x / S, v = y / S; return grey(.34 + N.tfbm(u, v, 2, 180, 2) * .12 + N.tfbm(u, v, 8, 8, 2) * .05); });
    return { map: null, normal: null, rough, tile: [tile, tile] };
  },

  /** Water ripple (normal only). */
  ripple(N, S, { tile = 8 } = {}) {
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S, v = y / S; H[y * S + x] = N.tfbm(u, v, 6, 6, 2) + .5 * N.tfbm(u, v, 16, 10, 2); }
    return { map: null, normal: heightToNormal(H, S, S, 2), rough: null, tile: [tile, tile] };
  },

  /** Generic ground (plinth tops, preview terrain): grass / meadow / bare earth. */
  ground(N, S, { tile = 8 } = {}) {
    // muted, slightly cool meadow: canopy-mid ↔ canopy-light, a little paddy-young, sparse bare earth
    const CM = rgb(TOKENS.canopyMid), A = rgb(TOKENS.canopyLight), P = rgb(TOKENS.paddyYoung), E = rgb(0x8c7a62), F = rgb(TOKENS.forest);
    const H = new Float32Array(S * S), R = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, m = N.tfbm(u, v, 4, 4, 4), c = N.tfbm(u, v, 24, 24, 3), f = N.tfbm(u, v, 96, 96, 2);
      let col = mix(CM, A, clamp(.55 + m * 1.0)); col = mix(col, P, sstep(.22, .45, m) * .3);
      col = mix(col, E, sstep(.25, .45, -m) * .45); col = mix(col, F, sstep(.18, .4, c) * .35);
      H[i] = c * .6 + f * .4; R[i] = .93 + f * .04;
      return shade(col, .95 + f * .08);
    });
    return { map, normal: heightToNormal(H, S, S, 2.5), rough: paint(S, S, (x, y, i) => grey(R[i])), tile: [tile, tile] };
  },

  /** Terrain skirt strata. U tiles along the perimeter (metres); V = 0 top → 1 bottom (normalised). */
  skirt(N, S, { tile = 40 } = {}) {
    const SO = rgb(0x4a3a2c), LINE = rgb(0x5e4b39), E = rgb(TOKENS.umberEarth), D = rgb(TOKENS.umberDeep), H = new Float32Array(S * S);
    const map = paint(S, S, (x, y, i) => {
      const u = x / S, v = y / S, strata = N.tfbm(u, v * .5, 3, 24, 3), grit = N.tfbm(u, v, 64, 64, 2);
      H[i] = strata * .7 + grit * .3;
      if (v < .006) return LINE;
      if (v < .08) return shade(SO, 1 + strata * .2 + grit * .1);
      return shade(mix(E, D, sstep(.1, 1, v)), 1 + strata * .35 + grit * .08);
    });
    return { map, normal: heightToNormal(H, S, S, 2), rough: null, tile: [tile, 1], clampV: true };
  },

  /** Window glow gradient (warm at the bottom), multiplied by the mood glow colour. */
  glow(N, S) {
    const ramp = GLOW_RAMP.map(rgb);
    const map = paint(16, S, (x, y) => { const t = y / (S - 1) * (ramp.length - 1), k = Math.floor(t), f = t - k; return mix(ramp[k], ramp[Math.min(k + 1, ramp.length - 1)], f); });
    return { map, normal: null, rough: null, tile: [1, 1] };
  },

  /** Soft radial alpha (ghost shadows, halos). */
  // alphaMaps are read from the GREEN channel, so these encode alpha as grey.
  radial(N, S) { const map = paint(S, S, (x, y) => grey(Math.pow(clamp(1 - Math.hypot(x / S - .5, y / S - .5) * 2), 1.8))); return { map, tile: [1, 1] }; },

  /** Leader-line fade: opaque at the bottom, transparent in the top 30 %. */
  fade(N, S) { const map = paint(4, S, (x, y) => grey(1 - sstep(.7, 1, 1 - y / (S - 1)))); return { map, tile: [1, 1] }; },
};

// ═════════════════════════════════════════════════════════ 5. MATERIALS ════
/** Every allowed material name (design.md §3.2). The validator rejects anything else. */
export const MATERIAL_NAMES = Object.freeze([
  'M_timber_cedar', 'M_timber_dark', 'M_glulam', 'M_timber_painted', 'M_medallion', 'M_bamboo_slat', 'M_lime_wall',
  'M_stone_masonry', 'M_slate_roof', 'M_gold', 'M_steel_dark', 'M_glass', 'M_window_glow', 'M_textile_tile', 'M_clay', 'M_clay_roof',
  'M_terrain', 'M_skirt', 'M_water', 'M_gravel', 'M_paddy', 'M_paddy_flooded', 'M_canopy', 'M_anchor',
]);

const _canvasCache = new Map();
function recipe(name, S, opts = {}) {
  const key = name + ':' + S + ':' + JSON.stringify(opts);
  if (!_canvasCache.has(key)) _canvasCache.set(key, RECIPES[name](createNoise(SEED), S, opts));
  return _canvasCache.get(key);
}
function toTex(canvas, { srgb = false, tile = [1, 1], aniso = 8, clampV = false, decal = false }) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = decal ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = decal || clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.repeat.set(1 / tile[0], 1 / tile[1]); t.anisotropy = aniso; t.needsUpdate = true;
  return t;
}
function texSet(r, aniso) {
  const o = { tile: r.tile, aniso, clampV: r.clampV, decal: r.decal };
  return { map: toTex(r.map, { ...o, srgb: true }), normalMap: toTex(r.normal, o), roughnessMap: toTex(r.rough, o) };
}
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

/**
 * Build the full M_* library. Call once per scene; textures are cached.
 * @param {{renderer?:THREE.WebGLRenderer, quality?:'high'|'low'}} opts
 * @returns {Record<string, THREE.Material>}
 */
export function createMaterials({ renderer = null, quality = 'high' } = {}) {
  const S = quality === 'low' ? 512 : 1024, aniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  const P = (name, params) => new THREE.MeshPhysicalMaterial({ name, ...clean(params) });
  const St = (name, params) => new THREE.MeshStandardMaterial({ name, ...clean(params) });
  const nrm = s => new THREE.Vector2(s, s);
  const M = {};

  M.M_timber_cedar = P('M_timber_cedar', { ...texSet(recipe('wood', S), aniso), roughness: 1, metalness: 0, clearcoat: .12, clearcoatRoughness: .5 });
  M.M_timber_dark = P('M_timber_dark', { ...texSet(recipe('wood', S, { dark: 0x3b281d, light: 0x6a4a36, contrast: 1.2 }), aniso), roughness: 1, metalness: 0 });
  M.M_glulam = P('M_glulam', { ...texSet(recipe('glulam', S), aniso), roughness: 1, metalness: 0, clearcoat: .08, clearcoatRoughness: .6 });
  M.M_timber_painted = P('M_timber_painted', { ...texSet(recipe('painted', S / 2), aniso), roughness: 1, clearcoat: .2, clearcoatRoughness: .4 });
  M.M_medallion = P('M_medallion', { ...texSet(recipe('medallion', 512), aniso), roughness: .5, clearcoat: .2, alphaTest: .35, side: THREE.DoubleSide });
  M.M_bamboo_slat = P('M_bamboo_slat', { ...texSet(recipe('bamboo', S), aniso), roughness: 1, sheen: .3, sheenColor: new THREE.Color(0xffd28c), sheenRoughness: .6 });
  M.M_lime_wall = P('M_lime_wall', { ...texSet(recipe('lime', S), aniso), roughness: 1, normalScale: nrm(.15) });
  M.M_stone_masonry = P('M_stone_masonry', { ...texSet(recipe('stone', S), aniso), roughness: 1, normalScale: nrm(.6) });
  M.M_slate_roof = P('M_slate_roof', { ...texSet(recipe('shingle', S), aniso), roughness: 1, clearcoat: .25, clearcoatRoughness: .5, normalScale: nrm(.5) });
  M.M_gold = P('M_gold', { color: TOKENS.gold, metalness: .65, roughness: .3, clearcoat: .3 });
  // dark bronze steel. Not darker than this: at dusk a darker metal reads as a black hole (skill rule).
  M.M_steel_dark = P('M_steel_dark', { color: 0x5a5048, metalness: .7, roughness: 1, roughnessMap: toTex(recipe('brushed', S / 2).rough, { tile: [1, 1], aniso }), anisotropy: .5, clearcoat: .3, clearcoatRoughness: .35 });
  M.M_glass = P('M_glass', { color: 0x1d2a30, roughness: .05, metalness: 0, ior: 1.5, envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: .03 });
  M.M_window_glow = new THREE.MeshBasicMaterial({ name: 'M_window_glow', map: toTex(recipe('glow', 128).map, { srgb: true }) });
  M.M_textile_tile = P('M_textile_tile', { ...texSet(recipe('textile', S), aniso), roughness: 1, clearcoat: .35, clearcoatRoughness: .2 });
  M.M_clay = St('M_clay', { color: TOKENS.sand, roughness: .85 });
  M.M_clay_roof = St('M_clay_roof', { color: 0xd9d3c8, roughness: .8 });
  M.M_terrain = St('M_terrain', { ...texSet(recipe('ground', S), aniso), roughness: 1 });
  M.M_skirt = St('M_skirt', { ...texSet(recipe('skirt', S / 2), aniso), roughness: 1, normalScale: nrm(.6) });
  M.M_water = P('M_water', { color: TOKENS.riverWater, normalMap: toTex(recipe('ripple', S / 2).normal, { tile: [8, 8], aniso }), normalScale: nrm(.25), roughness: .08, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1 });
  M.M_gravel = St('M_gravel', { ...texSet(recipe('gravel', S / 2), aniso), roughness: .95 });
  M.M_paddy = St('M_paddy', { ...texSet(recipe('paddy', S / 2), aniso), roughness: 1 });
  M.M_paddy_flooded = P('M_paddy_flooded', { ...texSet(recipe('paddy', S / 2, { flooded: true }), aniso), roughness: 1, clearcoat: .6, clearcoatRoughness: .1 });
  M.M_canopy = St('M_canopy', { color: 0xffffff, roughness: .9 });   // colour comes from instanceColor (jitterInstanceColors)
  M.M_anchor = new THREE.MeshBasicMaterial({ name: 'M_anchor', color: TOKENS.saffron, transparent: true, opacity: .9, depthWrite: false });

  for (const k of Object.keys(M)) M[k].userData.gmc = true;
  return M;
}
/** Variant materials that keep their library name, e.g. ripe paddy: variant(M.M_paddy, {color: TOKENS.paddyGold}). */
export function variant(material, params) { const m = material.clone(); m.setValues(params); m.name = material.name; return m; }

/** Canopy colour jitter between forest and canopy-light (design.md §3.2). */
export function jitterInstanceColors(mesh, { seed = SEED, amount = .08 } = {}) {
  const r = mulberry(seed), a = new THREE.Color(TOKENS.forest), b = new THREE.Color(TOKENS.canopyLight), c = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    c.copy(a).lerp(b, .35 + r() * .4); const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, clamp(hsl.l * (1 + (r() * 2 - 1) * amount), 0, 1));
    mesh.setColorAt(i, c);
  }
  mesh.instanceColor.needsUpdate = true; return mesh;
}

// ═════════════════════════════════════════════════════ 6. UV IN METRES ═════
/**
 * Replace UVs with box-projected UVs in metres (non-indexed result).
 * along: 'x' | 'y' | 'z' — the axis that should run along U when possible
 * (use the member's long axis for timber, so the grain follows it).
 */
export function metricUV(geometry, { along = null, scale = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const ax = { x: 0, y: 1, z: 2 };
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)); const an = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const dom = an[0] >= an[1] && an[0] >= an[2] ? 0 : an[1] >= an[2] ? 1 : 2;
    let [iu, iv] = dom === 0 ? [2, 1] : dom === 1 ? [0, 2] : [0, 1];
    if (along && ax[along] !== dom && ax[along] === iv) [iu, iv] = [iv, iu];
    for (let k = 0; k < 3; k++) { const p = [pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)]; uv[(t + k) * 2] = p[iu] * scale; uv[(t + k) * 2 + 1] = p[iv] * scale; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
/** Scale existing 0..1 UVs to metres (cylinders, lathes): u × uMetres, v × vMetres. */
export function scaleUV(geometry, uMetres, vMetres) {
  const uv = geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uMetres, uv.getY(i) * vMetres);
  uv.needsUpdate = true; return geometry;
}

// ════════════════════════════════════════════════ 7. ENVIRONMENT + RIG ═════
/** design.md §4.1 — the GMC PMREM environment (skill studio recipe, re-tinted). */
export function gmcEnvironment(pmrem, mood = 'dusk') {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: mood === 'dusk' ? 0x161a26 : 0x8a8f96, side: THREE.BackSide })));
  const panel = (w, h, i, pos, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); s.add(m); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (mood === 'dusk') {
    panel(14, 4, 4.0, V(-12, 3, 4), 0xffb978); panel(16, 6, 1.2, V(0, 14, 0), 0x3a4a6e);
    panel(1.2, 14, 2.0, V(11, 2, -6), 0x7cc8f2); panel(16, 1, 1.0, V(0, -7, 8), 0xffc450);
  } else {
    panel(18, 10, 3.0, V(-6, 12, 6), 0xfff3dc); panel(18, 10, 1.6, V(6, 12, -6), 0xdfe6ee);
    panel(1.2, 14, 2.0, V(11, 2, -6), 0xffffff); panel(16, 1, 1.2, V(0, -7, 8), 0xa9b865);
  }
  const tex = pmrem.fromScene(s, 0.02).texture;
  s.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

/** Key DirectionalLight (shadow caster) + HemisphereLight, driven by a mood. */
export function createRig(scene) {
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(key, key.target, hemi);
  const center = new THREE.Vector3(); let radius = 10, mood = 'dusk';
  function place() {
    const m = MOODS[mood], d = sunDirection(m.key.azimuth, m.key.elevation);
    key.target.position.copy(center); key.position.copy(center).addScaledVector(d, radius * 3);
    const cam = key.shadow.camera, r = radius * 1.1;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = radius * .1; cam.far = radius * 6; cam.updateProjectionMatrix();
  }
  return {
    key, hemi,
    setMood(name) {
      mood = name; const m = MOODS[name];
      key.color.set(m.key.color); key.intensity = m.key.intensity;
      hemi.color.set(m.hemi.sky); hemi.groundColor.set(m.hemi.ground); hemi.intensity = m.hemi.intensity; place();
    },
    /** Fit the shadow frustum to a Box3 (+10 %). mapSize 4096 for the map model. */
    fit(box, mapSize = 2048) {
      box.getCenter(center); radius = Math.max(box.getSize(new THREE.Vector3()).length() * .5, .5);
      if (key.shadow.mapSize.x !== mapSize) { key.shadow.mapSize.set(mapSize, mapSize); key.shadow.map?.dispose(); key.shadow.map = null; }
      place();
    },
  };
}

/** design.md §4.4 — the void: night→umber gradient, radial lift, mist band. Authored ~2× bright for ACES. */
export function createBackground(mood = 'dusk', w = 1024, h = 1024) {
  const m = MOODS[mood].background, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), k = mood === 'dusk' ? 2 : 1;
  const hex = (v, kk = 1) => { const [r, gg, b] = rgb(v).map(x => Math.min(255, Math.round(x * kk))); return `rgb(${r},${gg},${b})`; };
  const lin = g.createLinearGradient(0, 0, 0, h); lin.addColorStop(0, hex(m.top, k)); lin.addColorStop(1, hex(m.bottom, k));
  g.fillStyle = lin; g.fillRect(0, 0, w, h);
  const rad = g.createRadialGradient(w * .5, h * .55, 0, w * .5, h * .55, w * .6);
  rad.addColorStop(0, 'rgba(255,255,255,0.06)'); rad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rad; g.fillRect(0, 0, w, h);
  const mist = g.createLinearGradient(0, h * .3, 0, h * .5); const mc = rgb(m.mist).join(',');
  mist.addColorStop(0, `rgba(${mc},0)`); mist.addColorStop(.5, `rgba(${mc},0.06)`); mist.addColorStop(1, `rgba(${mc},0)`);
  g.fillStyle = mist; g.fillRect(0, h * .3, w, h * .2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Apply a mood to materials: window glow colour + environment intensity
 * (three r160 has no scene.environmentIntensity, so it is set per material).
 * Pass the library and/or any extra materials found in the scene.
 */
export function applyMoodToMaterials(materials, mood, extra = []) {
  const m = MOODS[mood], all = new Set([...Object.values(materials), ...extra]);
  for (const mt of all) {
    if (mt.name === 'M_window_glow') { mt.color.set(m.glow.color).multiplyScalar(m.glow.scale); continue; }
    if (mt.envMapIntensity === undefined) continue;
    if (mt.userData.envBase === undefined) mt.userData.envBase = mt.envMapIntensity;
    mt.envMapIntensity = mt.userData.envBase * m.envIntensity;
  }
}

// ═══════════════════════════════════════════════ 8. PRESENTATION PIECES ════
/**
 * Terrain skirt: vertical strata wall under a closed outline.
 * outline: Vector2[] in (x, z) metres. heightAt(x,z) gives the top edge.
 * bottomY defaults to (lowest top − depth). U = perimeter metres, V = 0 top → 1 bottom.
 */
export function createSkirt(outline, { depth, heightAt = () => 0, bottomY = null, material }) {
  const n = outline.length, tops = outline.map(p => heightAt(p.x, p.y));
  const bot = bottomY ?? Math.min(...tops) - depth;
  const pos = [], uv = [], idx = []; let len = 0;
  for (let i = 0; i <= n; i++) {
    const p = outline[i % n], t = tops[i % n];
    if (i > 0) len += p.distanceTo(outline[i - 1]);
    pos.push(p.x, t, p.y, p.x, bot, p.y); uv.push(len, 0, len, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  // make faces point outward
  const c = outline.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / n);
  const p0 = outline[0], p1 = outline[1], edge = new THREE.Vector3(p1.x - p0.x, 0, p1.y - p0.y), face = new THREE.Vector3().crossVectors(new THREE.Vector3(0, -1, 0), edge);
  const out = new THREE.Vector3((p0.x + p1.x) / 2 - c.x, 0, (p0.y + p1.y) / 2 - c.y);
  if (face.dot(out) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.name = 'skirt'; m.receiveShadow = true; m.castShadow = true; return m;
}

/** Rounded-rectangle outline in (x,z), centred on the origin. */
export function roundedRect(w, d, r, seg = 12) {
  const pts = [], hw = w / 2, hd = d / 2, rr = Math.min(r, hw, hd);
  const corners = [[hw - rr, hd - rr, 0], [-hw + rr, hd - rr, 90], [-hw + rr, -hd + rr, 180], [hw - rr, -hd + rr, 270]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= seg; i++) { const a = (a0 + 90 * i / seg) * DEG; pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)); }
  return pts;
}

/**
 * Floating-diorama plinth (design.md §6.3). Top surface at y = 0.
 * width/depth in metres; corner radius and skirt depth as fractions of the shorter side.
 */
export function createPlinth(materials, { width, depth = width, corner = .12, skirt = .10, top = 'M_terrain' } = {}) {
  const side = Math.min(width, depth), outline = roundedRect(width, depth, side * corner);
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, -p.y)));
  const topGeo = new THREE.ShapeGeometry(shape, 12); topGeo.rotateX(-Math.PI / 2);   // (x, y) → (x, 0, -y); UVs stay in metres
  const topMesh = new THREE.Mesh(topGeo, materials[top]); topMesh.name = 'plinth_top'; topMesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'L_plinth';
  group.add(topMesh, createSkirt(outline, { depth: side * skirt, material: materials.M_skirt }));
  group.userData = { width, depth, skirtDepth: side * skirt };
  return group;
}

/** Map anchor ring + optional leader line up to a floating hero (design.md §5.3 / §6.3). */
export function createAnchor(materials, { radius = 60, width = 12, leader = 0, lift = 2 } = {}) {
  const g = new THREE.Group(); g.name = 'L_anchor';
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + width, 96), materials.M_anchor);
  ring.rotation.x = -Math.PI / 2; ring.position.y = lift; ring.name = 'anchor_ring'; g.add(ring);
  if (leader > 0) {
    const mat = materials.M_anchor.clone(); mat.name = 'M_anchor'; mat.opacity = .6;
    mat.alphaMap = toTex(recipe('fade', 128).map, {}); mat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(radius * .02, radius * .02, leader, 8, 1, true), mat);
    line.position.y = lift + leader / 2; line.name = 'anchor_leader'; g.add(line);
  }
  return g;
}

/** Soft ghost shadow under a floating hero: umber at 18 %, size = 1.2 × footprint. */
export function createGhostShadow(footprintW, footprintD = footprintW) {
  const tex = toTex(recipe('radial', 128).map, {});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(footprintW * 1.2, footprintD * 1.2),
    new THREE.MeshBasicMaterial({ name: 'M_anchor', color: TOKENS.umber, alphaMap: tex, transparent: true, opacity: .18, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .5; m.name = 'ghost_shadow'; m.renderOrder = 1; return m;
}

// ═══════════════════════════════════════════════ 9. VALIDATE + HAND-OFF ═════
export const BUDGETS = Object.freeze({ map: 1_200_000, obj: 150_000, env: 30_000 });
const NAME_RE = /^gmc_(map|obj|env)_[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function countTriangles(root) {
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh) return; const g = o.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += c * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(n);
}

/**
 * Check a model against design.md §8–§9. Returns { ok, errors, warnings, stats }.
 * @param {THREE.Object3D} root  the model root (not the scene)
 */
export function validateModel(root, { budget = null } = {}) {
  const errors = [], warnings = [], mats = new Set(), unknown = new Set();
  const m = NAME_RE.exec(root.name || '');
  if (!m) errors.push(`Root name "${root.name}" must match gmc_<map|obj|env>_<id-name> (lowercase, hyphens).`);
  const cat = m ? m[1] : 'obj';
  if (!root.position.equals(new THREE.Vector3()) || !root.quaternion.equals(new THREE.Quaternion()) || !root.scale.equals(new THREE.Vector3(1, 1, 1)))
    errors.push('Root has a transform. Apply transforms before export (design.md §9.5).');
  for (const c of root.children) if (!c.name.startsWith('L_')) warnings.push(`Top-level child "${c.name || c.type}" should be a layer named L_*.`);
  root.traverse(o => {
    if (o.isLight || o.isCamera) errors.push(`"${o.name || o.type}" is a ${o.isLight ? 'light' : 'camera'}. No lights or cameras inside model files.`);
    if (!o.isMesh) return;
    for (const mt of [].concat(o.material)) { mats.add(mt.name); if (!MATERIAL_NAMES.includes(mt.name)) unknown.add(mt.name || '(unnamed)'); }
  });
  if (unknown.size) errors.push(`Materials not in the library: ${[...unknown].join(', ')}. Add to design.md §3.2 first.`);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), tris = countTriangles(root);
  // pivot check ignores the plinth skirt (plinth pivot = centre of its top surface, §8.3)
  const ground = new THREE.Box3(); root.children.forEach(c => { if (c.name !== 'L_plinth') ground.expandByObject(c); });
  if (ground.isEmpty()) ground.copy(box);
  const lim = budget ?? BUDGETS[cat];
  if (tris > lim) errors.push(`${tris.toLocaleString()} triangles > budget ${lim.toLocaleString()} (design.md §8.4).`);
  const big = Math.max(size.x, size.y, size.z);
  if (cat !== 'map' && big > 20000) warnings.push(`Largest dimension ${Math.round(big)} m: are units metres?`);
  if (big < .05) warnings.push(`Largest dimension ${big.toFixed(3)} m: are units metres?`);
  if (cat !== 'map' && Math.abs(ground.min.y) > Math.max(.05, size.y * .02)) warnings.push(`Lowest point is at y = ${ground.min.y.toFixed(2)} m. Pivot should be at ground contact (design.md §8.3).`);
  return { ok: errors.length === 0, errors, warnings, stats: { category: cat, triangles: tris, size: size.toArray().map(v => +v.toFixed(2)), materials: [...mats].sort() } };
}

/** design.md §9.4 metadata sidecar, pre-filled from the model. */
export function createMeta(root, { version = 1, author = 'A', status = 'review', sourceRefs = [], notes = '', heroYaw = 0, lods = {} } = {}) {
  const r = validateModel(root), cat = { map: 'map', obj: 'object', env: 'environment' }[r.stats.category];
  return { id: root.name, version, category: cat, author, status, anchorUTM46N: [0, 0], anchorMapXZ: [0, 0],
    footprintM: [r.stats.size[0], r.stats.size[2]], heightM: r.stats.size[1], heroScale: null, heroYaw,
    tris: { lod0: r.stats.triangles, lod1: lods.lod1 ?? 0, lod2: lods.lod2 ?? 0 }, materials: r.stats.materials, sourceRefs, notes, kitVersion: KIT_VERSION };
}

function download(blob, filename) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
/** Export a model root to GLB (design.md §9.5) and trigger a download. Returns the ArrayBuffer. */
export async function exportGLB(root, filename = `${root.name || 'model'}.glb`) {
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  download(new Blob([buf], { type: 'model/gltf-binary' }), filename); return buf;
}
export function downloadJSON(obj, filename) { download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename); }

// ══════════════════════════════════════════════════════════════ 10. STAGE ═══
/**
 * The shared review stage: renderer, post, rig, environment, background,
 * shadow catcher, orbit controls (zoom to cursor), DUSK/DAY, MATERIAL/CLAY,
 * the five standard views (design.md §8.5) and FPS auto-downgrade.
 * Every model preview should be built on this, so every review looks the same.
 */
export function createStage({ container = document.body, mood = 'dusk', quality = 'high' } = {}) {
  const W = () => container.clientWidth || innerWidth, H = () => container.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1)); renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(30, W() / H(), .1, 20000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 50000);
  let camera = persp;
  const controls = new OrbitControls(persp, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, zoomToCursor: true, screenSpacePanning: true, maxPolarAngle: Math.PI * .495 });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envs = { dusk: gmcEnvironment(pmrem, 'dusk'), day: gmcEnvironment(pmrem, 'day') };
  const backgrounds = { dusk: createBackground('dusk'), day: createBackground('day') };
  const rig = createRig(scene), materials = createMaterials({ renderer, quality });
  const content = new THREE.Group(); content.name = '__content'; scene.add(content);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: TOKENS.umber, opacity: .38 }));
  catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.name = '__shadowCatcher'; scene.add(catcher);

  const rt = new THREE.WebGLRenderTarget(W(), H(), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera), bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), .3, .5, .9);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());

  let current = mood, clay = false, lowQ = quality === 'low';
  const bounds = new THREE.Box3(), center = new THREE.Vector3(), sizeV = new THREE.Vector3();
  let radius = 10;

  function setMood(name) {
    current = name; const m = MOODS[name];
    scene.environment = envs[name]; scene.background = backgrounds[name];
    renderer.toneMappingExposure = m.exposure; rig.setMood(name);
    Object.assign(bloom, { strength: m.bloom.strength, radius: m.bloom.radius, threshold: m.bloom.threshold });
    const extra = []; content.traverse(o => { if (o.isMesh) extra.push(...[].concat(o.userData.__mat ?? o.material)); });
    applyMoodToMaterials(materials, name, extra);
  }
  function setClay(on) {
    clay = on;
    content.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        if (o.userData.__mat === undefined) { o.userData.__mat = o.material; o.userData.__ic = o.instanceColor ?? null; o.userData.__vis = o.visible; }
        const glow = [].concat(o.userData.__mat).some(m => m.name === 'M_window_glow' || m.name === 'M_anchor');
        if (glow) o.visible = false; else o.material = /roof/.test([].concat(o.userData.__mat)[0].name) ? materials.M_clay_roof : materials.M_clay;
        if (o.isInstancedMesh) o.instanceColor = null;            // clay is uniform
      } else if (o.userData.__mat !== undefined) {
        o.material = o.userData.__mat; if (o.isInstancedMesh) o.instanceColor = o.userData.__ic;
        o.visible = o.userData.__vis ?? true; delete o.userData.__mat; delete o.userData.__ic; delete o.userData.__vis;
      }
    });
  }
  function enableShadows(obj) { obj.traverse(o => { if (o.isMesh && !['M_window_glow', 'M_anchor'].includes([].concat(o.material)[0].name)) { o.castShadow = true; o.receiveShadow = true; } }); }

  function measure() {
    bounds.setFromObject(content); if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 5, 5));
    bounds.getCenter(center); bounds.getSize(sizeV); radius = Math.max(sizeV.length() * .5, .5);
    rig.fit(bounds, radius > 2000 ? 4096 : 2048);
    catcher.scale.setScalar(radius * 12); catcher.position.set(center.x, bounds.min.y - .01, center.z);
    for (const c of [persp, ortho]) { c.near = Math.max(.05, radius / 2000); c.far = radius * 60; c.updateProjectionMatrix(); }
  }
  function useCamera(c) { camera = c; renderPass.camera = c; controls.object = c; controls.enableRotate = c === persp; }
  function place(az, el, dist, target = center) {
    const d = sunDirection(az, el); persp.position.copy(target).addScaledVector(d, dist); controls.target.copy(target); persp.lookAt(target);
  }
  /** V1 overview · V2 hero 3/4 · V3 plan (ortho, north up) · V4 eye level · V5 detail. opts: { heroYaw, target:Vector3 } */
  function setView(name = 'V2', { heroYaw = 0, target = null } = {}) {
    measure(); const half = 15 * DEG;
    persp.fov = name === 'V4' ? 40 : 30; persp.updateProjectionMatrix(); useCamera(persp); persp.up.set(0, 1, 0);
    if (name === 'V1') place(160, 45, radius / Math.sin(half) * 1.05);
    else if (name === 'V2') place(215 + heroYaw, 25, radius * 3.6);   // ≈ 70 % of frame height at FOV 30
    else if (name === 'V4') {
      // frame the object, not its plinth; ground = y 0 when a plinth/skirt reaches below it (§8.3)
      const subj = new THREE.Box3(); content.traverse(o => { if (o.isMesh && !o.parent?.name.startsWith('L_plinth') && o.name !== 'skirt') subj.expandByObject(o); });
      if (subj.isEmpty()) subj.copy(bounds);
      const gy = bounds.min.y < 0 ? 0 : bounds.min.y, sc = subj.getCenter(new THREE.Vector3()), ss = subj.getSize(new THREE.Vector3());
      persp.position.set(sc.x, gy + 1.7, subj.max.z + Math.max(ss.y * 1.5, 6));
      controls.target.set(sc.x, gy + Math.min(ss.y * .45, 12), sc.z); persp.lookAt(controls.target);
    } else if (name === 'V5') {
      const t = target ?? new THREE.Vector3(center.x, bounds.min.y + sizeV.y * .7, bounds.max.z - sizeV.z * .15);
      place(215 + heroYaw, 25, radius * 3.6 * .25, t);                // the skill's 25 % close-up
    } else if (name === 'V3') {
      const m = 1.1, aspect = W() / H(), hw = Math.max(sizeV.x, sizeV.z * aspect) * m / 2;
      Object.assign(ortho, { left: -hw, right: hw, top: hw / aspect, bottom: -hw / aspect, zoom: 1 });
      ortho.position.set(center.x, bounds.max.y + radius * 2, center.z); ortho.up.set(0, 0, -1); ortho.lookAt(center.x, center.y, center.z);
      ortho.updateProjectionMatrix(); useCamera(ortho); controls.target.copy(center);
    }
    controls.update();
  }
  function add(obj) { content.add(obj); enableShadows(obj); if (clay) setClay(true); setMood(current); setView('V2'); return obj; }
  function setQuality(q) {
    lowQ = q === 'low'; renderer.setPixelRatio(lowQ ? 1 : Math.min(devicePixelRatio, 2)); bloom.enabled = !lowQ; resize();
  }
  function resize() {
    const w = W(), h = H(); renderer.setSize(w, h); composer.setSize(w, h); bloom.resolution.set(w, h);
    persp.aspect = w / h; persp.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  // loop + FPS
  const clock = new THREE.Clock(); let frames = 0, acc = 0, fps = 60, started = performance.now(), checked = false;
  const listeners = [];
  function render() { controls.update(); composer.render(); }
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta(); frames++; acc += dt;
    if (acc >= .5) { fps = frames / acc; frames = 0; acc = 0; listeners.forEach(f => f({ fps })); }
    if (!checked && performance.now() - started > 3500) { checked = true; if (fps < 34 && !lowQ) setQuality('low'); }
    render();
  });

  setMood(mood); setView('V2');
  return {
    THREE, renderer, scene, controls, rig, materials, content, composer, bloom,
    get camera() { return camera; }, get mood() { return current; }, get clay() { return clay; }, get quality() { return lowQ ? 'low' : 'high'; }, get fps() { return fps; },
    setMood, setClay, setView, setQuality, add, render, measure,
    onStats: f => listeners.push(f),
    validate: (root, o) => validateModel(root, o),
    exportGLB: async root => { const was = clay; if (was) setClay(false); const b = await exportGLB(root); if (was) setClay(true); return b; },
    screenshot(filename = 'preview.png') { render(); renderer.domElement.toBlob(b => download(b, filename)); },
  };
}
