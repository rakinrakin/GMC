import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { toThree } from '../../src/math/coords';
import { createClouds, FOREGROUND_CARDS, atlasLayout, GMC_GAP, inGmcGap } from '../../src/scene/clouds';
import type { Stage } from '../../src/scene/stage';

const loaded: string[] = [];

beforeEach(() => {
  loaded.length = 0;
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (url, onLoad) {
    loaded.push(url);
    const tex = new THREE.Texture();
    tex.image = { width: 600, height: 300 };
    onLoad?.(tex);
    return tex;
  });
});

const fakeStage = (tier: 'desktop' | 'mobile') =>
  ({ tier, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }) as unknown as Stage;

const meshes = (g: THREE.Group) => g.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh);
const mesh = (g: THREE.Group) => {
  const m = meshes(g);
  expect(m).toHaveLength(1);
  return m[0];
};
/** [letter index, opacity] per drawn instance. */
const cards = (m: THREE.InstancedMesh) => {
  const a = m.geometry.getAttribute('aCard') as THREE.InstancedBufferAttribute;
  return Array.from({ length: m.count }, (_, i) => [a.getX(i), a.getY(i)]);
};
const positions = (m: THREE.InstancedMesh) => {
  const mat = new THREE.Matrix4();
  return Array.from({ length: m.count }, (_, i) => {
    m.getMatrixAt(i, mat);
    return new THREE.Vector3().setFromMatrixPosition(mat);
  });
};

describe('createClouds', () => {
  it('builds the configured instance counts on desktop', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    expect(sets.deck.count).toBe(CONFIG.clouds.deck);
    expect(mesh(sets.deck.group).count).toBe(CONFIG.clouds.deck);
    expect(sets.breakup.count).toBe(CONFIG.clouds.breakup + FOREGROUND_CARDS);
    expect(mesh(sets.breakup.group).count).toBe(CONFIG.clouds.breakup + FOREGROUND_CARDS);
    expect(sets.veil.count).toBe(0);
    expect(mesh(sets.veil.group).count).toBe(0);
  });

  it('halves counts on mobile', () => {
    const s = CONFIG.mobileCloudScale;
    const { sets } = createClouds(fakeStage('mobile'));
    expect(sets.deck.count).toBe(Math.round(CONFIG.clouds.deck * s));
    expect(sets.breakup.count).toBe(Math.round(CONFIG.clouds.breakup * s) + Math.round(FOREGROUND_CARDS * s));
  });

  it('draws each set as a single InstancedMesh over a texture atlas', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    for (const set of [sets.deck, sets.breakup, sets.veil]) mesh(set.group);
    expect(new Set(loaded.filter((u) => u.endsWith('_side.webp'))).size).toBe(5);
    expect(new Set(loaded.filter((u) => u.endsWith('_top.webp'))).size).toBe(5);
    // Deck and veil share the side atlas.
    const u = (g: THREE.Group) => (mesh(g).material as THREE.ShaderMaterial).uniforms;
    expect(u(sets.deck.group).uMap).toBe(u(sets.veil.group).uMap);
    expect(u(sets.deck.group).uAspects.value[0]).toBeCloseTo(2);
  });

  it('lays the atlas out as non-overlapping vertical slots with each texture aspect', () => {
    const l = atlasLayout([{ width: 600, height: 300 }, { width: 400, height: 400 }], 8);
    expect(l.width).toBe(600);
    expect(l.height).toBe(300 + 8 + 400);
    expect(l.aspects).toEqual([2, 1]);
    const [a, b] = l.rects;
    expect(a[1] + a[3]).toBeLessThanOrEqual(b[1]);
    expect(b[2]).toBeCloseTo(400 / 600);
  });

  it('is deterministic for a seed', () => {
    const a = createClouds(fakeStage('desktop'), 7);
    const b = createClouds(fakeStage('desktop'), 7);
    const c = createClouds(fakeStage('desktop'), 8);
    const first = (x: typeof a, g: 'deck' | 'breakup') => Array.from(mesh(x.sets[g].group).instanceMatrix.array.slice(0, 16));
    expect(first(a, 'deck')).toEqual(first(b, 'deck'));
    expect(first(a, 'deck')).not.toEqual(first(c, 'deck'));
    expect(first(a, 'breakup')).toEqual(first(b, 'breakup'));
  });

  it('sorts each whole set back to front from its spawn camera', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const check = (g: THREE.Group, cam: [number, number, number]) => {
      const c = new THREE.Vector3(...toThree(cam));
      const d = positions(mesh(g)).map((p) => p.distanceTo(c));
      for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1] + 1e-9);
    };
    check(sets.deck.group, CONFIG.timeline[0].pos);
    check(sets.breakup.group, CONFIG.timeline[1].pos);
  });

  it('keeps C top at most ~15% of top cards and gives top cards reference opacities', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const cs = cards(mesh(sets.breakup.group));
    expect(cs.filter(([l]) => l === 2).length / cs.length).toBeLessThanOrEqual(0.15);
    const ops = new Set(cs.map(([, o]) => Math.round(o * 100) / 100));
    expect([...ops].sort()).toEqual([0.85, 0.95, 1]);
  });

  it('keeps foreground cards off the F2 view axis (>6 degrees) per the reference layout', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const m = mesh(sets.breakup.group);
    const f2 = CONFIG.timeline[1];
    const cam = new THREE.Vector3(...toThree(f2.pos));
    const axis = new THREE.Vector3(...toThree(f2.target)).sub(cam).normalize();
    const cs = cards(m);
    const fore = positions(m).filter((_, i) => Math.abs(cs[i][1] - 0.95) < 1e-6);
    expect(fore).toHaveLength(FOREGROUND_CARDS);
    for (const p of fore) {
      const ang = (p.clone().sub(cam).angleTo(axis) * 180) / Math.PI;
      expect(ang).toBeGreaterThan(6);
      // Blender y in -55..-40, z in 21..25, |x+4| in 9..16
      expect(-p.z).toBeGreaterThanOrEqual(-55);
      expect(-p.z).toBeLessThanOrEqual(-40);
      expect(p.y).toBeGreaterThanOrEqual(21);
      expect(p.y).toBeLessThanOrEqual(25);
      expect(Math.abs(p.x + 4)).toBeGreaterThanOrEqual(9);
      expect(Math.abs(p.x + 4)).toBeLessThanOrEqual(16);
    }
  });

  it('keeps the main break-up field out of the ellipse over GMC, still 150 + 10 cards', () => {
    for (const tier of ['desktop', 'mobile'] as const) {
      const { sets } = createClouds(fakeStage(tier));
      const m = mesh(sets.breakup.group);
      const cs = cards(m);
      const ps = positions(m);
      const main = ps.filter((_, i) => Math.abs(cs[i][1] - 0.95) > 1e-6);
      const s = tier === 'mobile' ? CONFIG.mobileCloudScale : 1;
      expect(main).toHaveLength(Math.round(CONFIG.clouds.breakup * s));
      for (const p of main) {
        const bx = p.x, by = -p.z; // three -> Blender
        const k = ((bx - GMC_GAP.center[0]) / GMC_GAP.semiAxes[0]) ** 2 + ((by - GMC_GAP.center[1]) / GMC_GAP.semiAxes[1]) ** 2;
        expect(k).toBeGreaterThan(1);
      }
    }
  });

  it('rejects cards whose disc reaches more than 30% of W into the gap', () => {
    const [cx, cy] = GMC_GAP.center;
    const top = cy + GMC_GAP.semiAxes[1];
    // 2 km above the top of the ellipse: W=10 reaches 3 km in (30%) -> allowed; W=20 reaches 8 km -> rejected.
    expect(inGmcGap(cx, top + 2, 10)).toBe(false);
    expect(inGmcGap(cx, top + 2, 20)).toBe(true);
    expect(inGmcGap(cx, cy, 1)).toBe(true);
    expect(inGmcGap(cx, top + 30, 34)).toBe(false);
  });

  it('setOpacity drives the shared opacity uniform and the deck mist floor', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    sets.deck.setOpacity(0);
    expect((mesh(sets.deck.group).material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    const floor = sets.deck.group.getObjectByName('cloud_floor') as THREE.Mesh;
    expect(floor.position.y).toBeCloseTo(11.9);
    expect((floor.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    expect(sets.deck.group.visible).toBe(false);
    sets.deck.setOpacity(0.5);
    expect((mesh(sets.deck.group).material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);
    expect(sets.deck.group.visible).toBe(true);
  });

  it('uses straight alpha (no upload premultiply) with premultiplied output blending', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const mat = mesh(sets.deck.group).material as THREE.ShaderMaterial;
    expect(mat.premultipliedAlpha).toBe(true);
    expect(mat.uniforms.uMap.value.premultiplyAlpha).toBe(false);
    expect(mat.fragmentShader).not.toMatch(/\/\s*a0/);
  });

  it('places veil cards on demand (Blender coords to three) up to capacity', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    sets.veil.place([[1, 2, 3, 10], [4, 5, 6, 12]]);
    expect(sets.veil.count).toBe(2);
    const ps = positions(mesh(sets.veil.group)).map((p) => [p.x, p.y, p.z]);
    expect(ps).toContainEqual([1, 3, -2]);
    expect(sets.veil.group.visible).toBe(true);
    const many = Array.from({ length: 40 }, (_, i) => [i, 0, 0, 5] as [number, number, number, number]);
    sets.veil.place(many);
    expect(sets.veil.count).toBe(CONFIG.clouds.veil);
  });

  it('update advances the shared time uniform', () => {
    const clouds = createClouds(fakeStage('desktop'));
    const u = (mesh(clouds.sets.deck.group).material as THREE.ShaderMaterial).uniforms.uTime;
    const before = u.value;
    clouds.update(1000, new THREE.PerspectiveCamera());
    expect(u.value).toBeCloseTo(before + 1);
  });

  it('adds all sets to the scene with deck above terrain and breakup above deck', () => {
    const stage = fakeStage('desktop');
    const { sets } = createClouds(stage);
    expect(stage.scene.children).toContain(sets.deck.group);
    expect(mesh(sets.deck.group).renderOrder).toBeGreaterThan(0);
    expect(mesh(sets.breakup.group).renderOrder).toBeGreaterThan(mesh(sets.deck.group).renderOrder);
  });
});
