// ─────────────────────────────────────────────────────────────────────────────
// GMC volumetric clouds · v1.2.0   (environment kit E5, design.md §7)
// Raymarched cumulus at map scale (metres), depth-aware so it can sit over the
// GMC map. No interactive wind physics: clouds only drift and billow slowly.
//
// Texture: 128³ Perlin-Worley base + 64³ Worley detail, two-scale erosion with
//   swirl distortion (crisp cauliflower tops, wispy bases).
// Depth:   Beer–Lambert sun light-march (self-shadowing), sky-light occlusion
//   (dark crevices and bellies), dual-lobe Henyey–Greenstein + multiple-scattering
//   octaves (silver lining), powder darkening, a high cirrus layer above the
//   cumulus, and aerial perspective that tints distance towards the horizon.
//
// Usage:
//   const clouds = await createCloudLayer(renderer, { onProgress });
//   each frame: clouds.update(dt, camera); render your scene into a target with
//   a DepthTexture; clouds.render(camera, target.depthTexture); composite with
//   new ShaderPass(clouds.compositeShader(target.texture)) — then set
//   pass.uniforms.tScene.value = target.texture again (ShaderPass drops RT textures).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createNoise, MOODS, TOKENS, SEED } from './gmc-kit.js';

export const CLOUDS_VERSION = '1.2.0';   // 1.2.0: + setClear() clear zone (opt-in, off by default)

// ═══════════════════════════════════════════════════════════════ moods ═════
// GOLDEN follows the Columbus hero; DUSK / DAY take the sun from the GMC kit.
const C = h => new THREE.Color(h);
export const CLOUD_MOODS = {
  golden: { sun: { az: 250, el: 6, color: 0xffe0b4, intensity: 3.4 },
    sky: { zenith: 0x4f86c4, mid: 0x93b8dd, horizon: 0xf6d8ae, deck: 0x9c94b4, glow: 0xffd08a, glowStr: 1 },
    amb: { top: 0x8fa9d4, bottom: 0x5c5684 }, haze: 0xe9d9c4, hazeDist: 55000, exposure: .85,
    bloom: { strength: .16, radius: .55, threshold: 1.2 } },
  dusk: { sun: { az: MOODS.dusk.key.azimuth, el: MOODS.dusk.key.elevation, color: TOKENS.marigold, intensity: 2.8 },
    sky: { zenith: 0x10162a, mid: 0x262a44, horizon: 0x6b4a3a, deck: 0x221b24, glow: 0xffb978, glowStr: .85 },
    amb: { top: 0x3a4a72, bottom: 0x22161c }, haze: 0x3b3038, hazeDist: 40000, exposure: 1.05, cirrus: .35,
    bloom: { strength: .22, radius: .5, threshold: 1.1 } },
  day: { sun: { az: MOODS.day.key.azimuth, el: MOODS.day.key.elevation, color: TOKENS.glowCream, intensity: 3.6 },
    sky: { zenith: 0x7fa3c8, mid: 0xb4c8dc, horizon: 0xdce1e6, deck: 0xa9b0ba, glow: 0xfff3dc, glowStr: .6 },
    amb: { top: 0xa9bcd2, bottom: 0x6c7482 }, haze: 0xd3d9df, hazeDist: 65000, exposure: .95, cirrus: .8,
    bloom: { strength: .1, radius: .4, threshold: 1.3 } },
};
export function sunVector(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// ═════════════════════════════════════════════════════════ noise volumes ═══
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
const wrap = (i, n) => ((i % n) + n) % n;
/** Tileable Worley with feature points precomputed per cell (fast). Returns f(px,py,pz) in 0..1 (1 = at a point). */
function makeWorley(cells, seed) {
  const pts = new Float32Array(cells ** 3 * 3);
  for (let z = 0; z < cells; z++) for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const i = ((z * cells + y) * cells + x) * 3; pts[i] = hash3(x, y, z, seed); pts[i + 1] = hash3(x, y, z, seed + 1); pts[i + 2] = hash3(x, y, z, seed + 2);
  }
  return (px, py, pz) => {
    const x = px * cells, y = py * cells, z = pz * cells, xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let md = 9;
    for (let dz = -1; dz <= 1; dz++) { const cz = zi + dz, wz = wrap(cz, cells);
      for (let dy = -1; dy <= 1; dy++) { const cy = yi + dy, wy = wrap(cy, cells);
        for (let dx = -1; dx <= 1; dx++) { const cx = xi + dx, i = ((wz * cells + wy) * cells + wrap(cx, cells)) * 3;
          const fx = cx + pts[i] - x, fy = cy + pts[i + 1] - y, fz = cz + pts[i + 2] - z, d = fx * fx + fy * fy + fz * fz; if (d < md) md = d; } } }
    return 1 - Math.min(Math.sqrt(md), 1);
  };
}
function vnoise(px, py, pz, f, seed) {
  const x = px * f, y = py * f, z = pz * f, xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = x - xi, v = y - yi, w = z - zi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), sw = w * w * (3 - 2 * w);
  const h = (a, b, c) => hash3(wrap(a, f), wrap(b, f), wrap(c, f), seed), l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), su), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), su), sv),
           l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), su), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), su), sv), sw);
}
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export async function buildCloudNoise({ size = 128, detail = 64, onProgress = () => {} } = {}) {
  const base = new Uint8Array(size ** 3), det = new Uint8Array(detail ** 3);
  const w4 = makeWorley(4, SEED + 3), w8 = makeWorley(8, SEED + 5), w16 = makeWorley(16, SEED + 7);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x / size, py = y / size, pz = z / size;
      const pf = vnoise(px, py, pz, 4, SEED) * .5 + vnoise(px, py, pz, 8, SEED + 9) * .27 + vnoise(px, py, pz, 16, SEED + 17) * .15 + vnoise(px, py, pz, 32, SEED + 23) * .08;
      const wf = w4(px, py, pz) * .6 + w8(px, py, pz) * .28 + w16(px, py, pz) * .12;
      const pw = Math.min(1, Math.max(0, (pf - (wf - 1)) / (2 - wf)));        // Perlin-Worley
      base[(z * size + y) * size + x] = Math.round(Math.min(1, Math.max(0, (pw - .36) * 1.95)) * 255);
    }
    if (z % 4 === 3) { onProgress((z + 1) / size * .8); await yieldFrame(); }
  }
  const d4 = makeWorley(4, SEED + 31), d8 = makeWorley(8, SEED + 37), d16 = makeWorley(16, SEED + 41), d32 = makeWorley(32, SEED + 43);
  for (let z = 0; z < detail; z++) {
    for (let y = 0; y < detail; y++) for (let x = 0; x < detail; x++) {
      const px = x / detail, py = y / detail, pz = z / detail;
      det[(z * detail + y) * detail + x] = Math.round((d4(px, py, pz) * .45 + d8(px, py, pz) * .3 + d16(px, py, pz) * .17 + d32(px, py, pz) * .08) * 255);
    }
    if (z % 8 === 7) { onProgress(.8 + (z + 1) / detail * .15); await yieldFrame(); }
  }
  const tex3 = (data, n) => { const t = new THREE.Data3DTexture(data, n, n, n); t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  // 2D weather (coverage) map, tileable; G channel = cirrus streaks
  const N = createNoise(SEED + 101), W = 256, wd = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / W, i = (y * W + x) * 4;
    wd[i] = Math.round(Math.min(1, Math.max(0, .5 + N.tfbm(u, v, 3, 3, 4) * 1.25 + N.tfbm(u, v, 9, 9, 2) * .25)) * 255);
    wd[i + 1] = Math.round(Math.min(1, Math.max(0, .45 + N.tfbm(u, v, 2, 12, 4) * 1.6)) * 255);   // stretched: wispy cirrus bands
    wd[i + 3] = 255;
  }
  const weather = new THREE.DataTexture(wd, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping; weather.minFilter = weather.magFilter = THREE.LinearFilter; weather.needsUpdate = true;
  onProgress(1);
  return { base: tex3(base, size), detail: tex3(det, detail), weather };
}

// ════════════════════════════════════════════════════════════════ shaders ══
const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const CLOUD_FRAG = /* glsl */`
precision highp float; precision highp sampler3D;
varying vec2 vUv;
uniform sampler3D tBase; uniform sampler3D tDetail; uniform sampler2D tWeather; uniform sampler2D tDepth;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uNear; uniform float uFar; uniform float uUseDepth;
uniform vec3 uBoxMin; uniform vec3 uBoxMax;
uniform float uTime; uniform vec2 uDrift;
uniform float uCoverage; uniform float uDensity; uniform float uExt;
uniform float uBaseScale; uniform float uDetailScale; uniform float uWeatherScale; uniform float uDetailAmt; uniform float uRise;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbTop; uniform vec3 uAmbBot; uniform vec3 uHaze; uniform vec3 uHorizon; uniform float uHazeDist;
uniform float uMaxSteps; uniform float uLightSteps; uniform float uFrame; uniform float uCirrus; uniform float uCirrusY; uniform float uCirrusGain;
uniform vec4 uClearBox; uniform float uClearAmt;   // clear zone: rounded rect (halfX, halfZ, corner, -) at the origin, see setClear()
uniform float uClearInset; uniform float uClearSoft;
#define PI 3.14159265
float remap(float v, float a, float b, float c, float d){ return c + (v - a) / max(b - a, 1e-5) * (d - c); }
float hg(float c, float g){ float g2 = g * g; return (1. - g2) / (4. * PI * pow(max(1. + g2 - 2. * g * c, 1e-4), 1.5)); }
vec2 boxHit(vec3 ro, vec3 rd){ vec3 inv = 1. / rd; vec3 a = (uBoxMin - ro) * inv, b = (uBoxMax - ro) * inv; vec3 mn = min(a, b), mx = max(a, b);
  return vec2(max(max(mn.x, mn.y), mn.z), min(min(mx.x, mx.y), mx.z)); }

float density(vec3 p, float cheap){
  float H = uBoxMax.y - uBoxMin.y, h = clamp((p.y - uBoxMin.y) / H, 0., 1.);
  float w = texture2D(tWeather, (p.xz + uDrift * .55) / uWeatherScale).r;
  float cov = clamp(remap(w, 1. - uCoverage, 1., 0., 1.), 0., 1.);
  if (uClearAmt > 0.) {                                                  // keep a zone clear (e.g. over a map slab); clouds creep in by uClearInset
    vec2 cq = abs(p.xz) - (uClearBox.xy - uClearBox.z);
    float sd = length(max(cq, 0.)) + min(max(cq.x, cq.y), 0.) - uClearBox.z;   // < 0 inside the zone
    cov *= mix(1., smoothstep(-uClearInset - uClearSoft, -uClearInset, sd + (w - .5) * uClearSoft), uClearAmt);
  }
  if (cov <= .001) return 0.;
  float top = .3 + .7 * cov;                                             // thicker cells tower higher
  float prof = smoothstep(0., .06, h) * (1. - smoothstep(top * .5, top, h)); // flat base, rounded top
  if (prof <= 0.) return 0.;
  vec3 q = vec3(p.x + uDrift.x, (p.y - uBoxMin.y) * 1.6, p.z + uDrift.y) / uBaseScale;
  float b = texture(tBase, q).r;
  float d = clamp(remap(b * prof, 1. - cov, 1., 0., 1.), 0., 1.) * cov;
  if (d <= 0.) return 0.;
  if (cheap < .5) {
    vec3 dq = (p + vec3(uDrift.x, 0., uDrift.y) * 1.2) / uDetailScale + vec3(0., -uTime * uRise, 0.);
    vec3 sw = vec3(texture(tDetail, dq * .31 + 7.1).r, texture(tDetail, dq * .31 + 3.7).r, texture(tDetail, dq * .31 + 1.3).r) - .5;
    dq += sw * .55;                                                       // swirl: curly, non-repeating edges
    float dn = texture(tDetail, dq).r * .62 + texture(tDetail, dq * 2.9 + .37).r * .38;   // two-scale erosion
    float m = mix(dn, 1. - dn, clamp(h * 3.2, 0., 1.));                  // wispy base, billowy top
    d = clamp(remap(d, m * uDetailAmt, 1., 0., 1.), 0., 1.);
  }
  return d * uDensity * mix(.75, 1.15, smoothstep(.0, .45, h));          // denser cores read as solid forms
}
float lightOD(vec3 p){
  float H = uBoxMax.y - uBoxMin.y, st = H * .07, od = 0.;
  for (int i = 0; i < 7; i++) { if (float(i) >= uLightSteps) break; float s = st * (1. + float(i) * .85); p += uSunDir * s; od += density(p, i < 2 ? 0. : 1.) * s; }
  return od * uExt;
}
float skyOD(vec3 p){                                                     // how buried this point is under cloud above it
  return (density(p + vec3(0., 140., 0.), 1.) * 140. + density(p + vec3(0., 420., 0.), 1.) * 280.) * uExt;
}
// thin high cirrus sheet: gives the sky a second depth layer
vec4 cirrus(vec3 ro, vec3 rd){
  if (uCirrus <= 0. || rd.y <= 0.002 || ro.y > uCirrusY) return vec4(0.);
  float t = (uCirrusY - ro.y) / rd.y; vec3 p = ro + rd * t;
  float c = texture2D(tWeather, (p.xz + uDrift * 1.6) / (uWeatherScale * 1.6)).g;
  c = smoothstep(.6, 1., c) * uCirrus * (1. - smoothstep(30000., 90000., t));
  vec3 col = uSunColor * (.08 + .3 * hg(dot(rd, uSunDir), .6) * 4. * PI * .25) + uAmbTop * .75;
  col = mix(col, uHorizon, 1. - exp(-t / (uHazeDist * 1.4)));
  c *= uCirrusGain; return vec4(col * c, c);
}
void main(){
  vec4 vp = uInvProj * vec4(vUv * 2. - 1., 1., 1.); vp.xyz /= vp.w;
  vec3 dv = normalize(vp.xyz), rd = normalize((uCamWorld * vec4(dv, 0.)).xyz), ro = uCamPos;
  float sceneT = 1e9;
  if (uUseDepth > .5) { float z = texture2D(tDepth, vUv).r; if (z < 1.) sceneT = ((uNear * uFar) / ((uFar - uNear) * z - uFar)) / dv.z; }
  vec4 ci = sceneT > 1e8 ? cirrus(ro, rd) : vec4(0.);
  vec2 tb = boxHit(ro, rd); float t0 = max(tb.x, 0.), t1 = min(tb.y, sceneT);
  if (t1 <= t0) { gl_FragColor = ci; return; }
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))) + uFrame * .61803);
  float cosT = dot(rd, uSunDir), H = uBoxMax.y - uBoxMin.y;
  vec3 col = vec3(0.); float T = 1., t = t0, tw = 0., wsum = 0.;
  t += clamp(t0 * .009 + 16., 16., 600.) * jit;
  for (int i = 0; i < 260; i++) {
    if (float(i) >= uMaxSteps || t > t1 || T < .01) break;
    float dt = clamp(t * .009 + 16., 16., 600.);
    vec3 p = ro + rd * t; float d = density(p, 0.);
    if (d > .0005) {
      float od = lightOD(p), h = clamp((p.y - uBoxMin.y) / H, 0., 1.);
      vec3 sunL = vec3(0.); float a = 1., bb = 1., cc = 1.;
      for (int o = 0; o < 3; o++) { float ph = mix(hg(cosT, .72 * cc), hg(cosT, -.22 * cc), .28) * 4. * PI; sunL += a * exp(-od * bb) * ph; a *= .5; bb *= .3; cc *= .55; }
      float powder = 1. - exp(-od * 2.4);
      sunL *= mix(1., mix(.25, 1., powder), clamp(.7 - .7 * cosT, 0., 1.));
      float ao = exp(-skyOD(p) * .55);                                     // sky light is blocked under cloud
      vec3 amb = mix(uAmbBot, uAmbTop, pow(h, .65)) * (.35 + .65 * ao);
      vec3 S = uSunColor * sunL + amb;
      float Tr = exp(-d * uExt * dt);
      col += S * (1. - Tr) * T;
      float wgt = (1. - Tr) * T; tw += t * wgt; wsum += wgt;
      T *= Tr; t += dt;
    } else t += dt * 1.8;
  }
  float tAvg = wsum > 0. ? tw / wsum : t0;
  float fog = 1. - exp(-tAvg / uHazeDist);
  col = mix(col, mix(uHaze, uHorizon, fog) * (1. - T), fog);             // aerial perspective, bluer/warmer far away
  // cirrus sits behind the cumulus
  gl_FragColor = vec4(col + ci.rgb * T, 1. - T * (1. - ci.a));
}`;

// Denoise: 9-tap tent filter over the jittered raymarch (hides the dither pattern), then blend with history.
const ACCUM_FRAG = /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tCur; uniform sampler2D tPrev; uniform float uAlpha; uniform vec2 uTexel;
void main(){
  vec2 o = uTexel;
  vec4 c = texture2D(tCur, vUv) * 4.
    + (texture2D(tCur, vUv + vec2(o.x, 0.)) + texture2D(tCur, vUv - vec2(o.x, 0.)) + texture2D(tCur, vUv + vec2(0., o.y)) + texture2D(tCur, vUv - vec2(0., o.y))) * 2.
    + texture2D(tCur, vUv + o) + texture2D(tCur, vUv - o) + texture2D(tCur, vUv + vec2(o.x, -o.y)) + texture2D(tCur, vUv + vec2(-o.x, o.y));
  gl_FragColor = mix(texture2D(tPrev, vUv), c / 16., uAlpha);
}`;

export const SKY_VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
export const SKY_FRAG = /* glsl */`precision highp float; varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uDeck; uniform vec3 uGlow; uniform vec3 uSunDir; uniform float uGlowStr;
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  // below the horizon: a hazy lavender lower deck (more cloud and haze beneath), not a flat ground colour
  vec3 c = e > 0. ? mix(uHorizon, mix(uMid, uZenith, smoothstep(.12, .75, e)), smoothstep(0., .22, e)) : mix(uHorizon, uDeck, smoothstep(0., -.12, e));
  float cs = max(dot(d, uSunDir), 0.);
  // sun: soft aureole, tight halo, bright core and disc (falls off fast so facing the sun doesn't wash out the sky)
  c += uGlow * uGlowStr * (pow(cs, 24.) * .16 + pow(cs, 160.) * .55 + pow(cs, 1800.) * 3.5 + smoothstep(.99988, .99996, cs) * 16.);
  c += uGlow * uGlowStr * .12 * pow(cs, 4.) * (1. - smoothstep(0., .22, abs(e)));   // warm band along the horizon
  gl_FragColor = vec4(c, 1.);
}`;

/** Sky dome (follows the camera). setMood(name) recolours it. */
export function createSky() {
  const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { uZenith: { value: C(0) }, uMid: { value: C(0) }, uHorizon: { value: C(0) }, uDeck: { value: C(0) }, uGlow: { value: C(0) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlowStr: { value: 1 } } });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(90000, 48, 24), mat); mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.name = 'sky';
  mesh.onBeforeRender = (r, s, cam) => mesh.position.copy(cam.position);
  mesh.setMood = name => { const m = CLOUD_MOODS[name], u = mat.uniforms;
    u.uZenith.value.set(m.sky.zenith); u.uMid.value.set(m.sky.mid); u.uHorizon.value.set(m.sky.horizon); u.uDeck.value.set(m.sky.deck); u.uGlow.value.set(m.sky.glow); u.uGlowStr.value = m.sky.glowStr;
    u.uSunDir.value.copy(sunVector(m.sun.az, m.sun.el)); };
  return mesh;
}

// ═══════════════════════════════════════════════════════════ cloud layer ═══
/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ min?:number[], max?:number[], quality?:'high'|'low', drift?:number, onProgress?:(f:number)=>void }} opts
 *   min/max: cloud volume in world metres (default 60 × 60 km field, 1.5–3.8 km altitude)
 *   drift:   slow drift speed in m/s of screen motion (0 = frozen clouds)
 */
export async function createCloudLayer(renderer, { min = [-30000, 1500, -30000], max = [30000, 3800, 30000], quality = 'high', drift = 40, onProgress } = {}) {
  const tex = await buildCloudNoise({ onProgress });
  const boxMin = new THREE.Vector3(...min), boxMax = new THREE.Vector3(...max);
  const mk = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const raw = mk(); let histA = mk(), histB = mk();
  const U = {
    tBase: { value: tex.base }, tDetail: { value: tex.detail }, tWeather: { value: tex.weather }, tDepth: { value: null },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uNear: { value: 1 }, uFar: { value: 1e5 }, uUseDepth: { value: 0 }, uBoxMin: { value: boxMin }, uBoxMax: { value: boxMax },
    uTime: { value: 0 }, uDrift: { value: new THREE.Vector2() },
    uCoverage: { value: .72 }, uDensity: { value: 1 }, uExt: { value: .05 },
    uBaseScale: { value: 7000 }, uDetailScale: { value: 1300 }, uWeatherScale: { value: 22000 }, uDetailAmt: { value: .5 }, uRise: { value: .004 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: C(0xffffff) }, uAmbTop: { value: C(0) }, uAmbBot: { value: C(0) },
    uHaze: { value: C(0) }, uHorizon: { value: C(0) }, uHazeDist: { value: 50000 }, uMaxSteps: { value: 220 }, uLightSteps: { value: 6 }, uFrame: { value: 0 },
    uCirrus: { value: .4 }, uCirrusY: { value: 9500 }, uCirrusGain: { value: 1 },
    uClearBox: { value: new THREE.Vector4(0, 0, 0, 0) }, uClearAmt: { value: 0 }, uClearInset: { value: 0 }, uClearSoft: { value: 1 },
  };
  const cloudQuad = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: CLOUD_FRAG, uniforms: U }));
  const accumMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: ACCUM_FRAG, uniforms: { tCur: { value: raw.texture }, tPrev: { value: null }, uAlpha: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) } } });
  const accumQuad = new FullScreenQuad(accumMat);

  let mood = 'golden', scale = .66, frame = 0, speed = drift; const lastCam = new THREE.Matrix4(); let moving = 1;
  const driftDir = new THREE.Vector2(Math.sin(70 * Math.PI / 180), -Math.cos(70 * Math.PI / 180));
  function setMood(name) {
    mood = name; const m = CLOUD_MOODS[name];
    U.uSunDir.value.copy(sunVector(m.sun.az, m.sun.el)); U.uSunColor.value.set(m.sun.color).multiplyScalar(m.sun.intensity);
    U.uAmbTop.value.set(m.amb.top); U.uAmbBot.value.set(m.amb.bottom);
    U.uHaze.value.set(m.haze); U.uHorizon.value.set(m.sky.horizon); U.uHazeDist.value = m.hazeDist; U.uCirrusGain.value = m.cirrus ?? 1; moving = 1;
  }
  let lastW = 4, lastH = 4;
  function setSize(w, h) { lastW = w; lastH = h; const W = Math.max(4, Math.round(w * scale)), H = Math.max(4, Math.round(h * scale)); raw.setSize(W, H); histA.setSize(W, H); histB.setSize(W, H); accumMat.uniforms.uTexel.value.set(1 / W, 1 / H); moving = 1; }
  function setQuality(q) { scale = q === 'high' ? .66 : .5; U.uMaxSteps.value = q === 'high' ? 220 : 120; U.uLightSteps.value = q === 'high' ? 6 : 4; setSize(lastW, lastH); }

  function update(dt, camera) {
    U.uDrift.value.addScaledVector(driftDir, speed * dt); U.uTime.value += dt;
    camera.updateMatrixWorld();
    const diff = camera.matrixWorld.elements.reduce((s, v, i) => s + Math.abs(v - lastCam.elements[i]), 0);
    moving = Math.max(moving * Math.exp(-dt * 6), diff > .5 ? 1 : 0); lastCam.copy(camera.matrixWorld);
    U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uCamWorld.value.copy(camera.matrixWorld); U.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    U.uNear.value = camera.near; U.uFar.value = camera.far;
  }
  /** Raymarch the clouds and accumulate over frames. depthTexture: the scene's depth, so clouds stop at the map. */
  function render(camera, depthTexture = null) {
    const prev = renderer.getRenderTarget();
    U.tDepth.value = depthTexture; U.uUseDepth.value = depthTexture ? 1 : 0; U.uFrame.value = (frame++ % 64);
    renderer.setRenderTarget(raw); cloudQuad.render(renderer);
    accumMat.uniforms.tPrev.value = histA.texture; accumMat.uniforms.uAlpha.value = moving > .05 ? .55 : .2;   // always average a little, even while moving
    renderer.setRenderTarget(histB); accumQuad.render(renderer); [histA, histB] = [histB, histA];
    renderer.setRenderTarget(prev); return histA.texture;
  }
  function compositeShader(sceneTexture) {
    return { uniforms: { tScene: { value: sceneTexture }, tClouds: { value: null } }, vertexShader: FS_VERT,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tClouds;
        void main(){ vec4 s = texture2D(tScene, vUv); vec4 c = texture2D(tClouds, vUv); gl_FragColor = vec4(s.rgb * (1. - c.a) + c.rgb, 1.); }` };
  }
  setMood('golden'); setQuality(quality);
  return { uniforms: U, boxMin, boxMax, setMood, setQuality, setSize, update, render, compositeShader,
    get mood() { return mood; }, setCoverage: c => { U.uCoverage.value = c; }, setDrift: s => { speed = s; }, setCirrus: c => { U.uCirrus.value = c; },
    /** Clear zone (1.2.0): a rounded rectangle centred on the origin where clouds thin out, e.g. so a map slab floats
     *  in a cloud sea. half: [x, z] metres, corner: radius, inset: how far clouds creep into the zone, soft: fade width,
     *  amount: 0 (off, default) .. 1. The edge follows the coverage map, so it reads as cloud, not a cut. */
    setClear: ({ half = [0, 0], corner = 0, inset = 0, soft = 1, amount = 1 } = {}) => {
      U.uClearBox.value.set(half[0], half[1], corner, 0); U.uClearInset.value = inset; U.uClearSoft.value = Math.max(1, soft); U.uClearAmt.value = amount; } };
}
