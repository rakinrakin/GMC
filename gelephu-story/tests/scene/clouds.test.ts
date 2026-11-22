import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { createClouds, FOREGROUND_CARDS } from '../../src/scene/clouds';
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
const total = (g: THREE.Group) => meshes(g).reduce((s, m) => s + m.count, 0);

describe('createClouds', () => {
  it('builds the configured instance counts on desktop', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    expect(sets.deck.count).toBe(CONFIG.clouds.deck);
    expect(total(sets.deck.group)).toBe(CONFIG.clouds.deck);
    expect(sets.breakup.count).toBe(CONFIG.clouds.breakup + FOREGROUND_CARDS);
    expect(total(sets.breakup.group)).toBe(CONFIG.clouds.breakup + FOREGROUND_CARDS);
    expect(sets.veil.count).toBe(0);
    expect(total(sets.veil.group)).toBe(0);
  });

  it('halves counts on mobile', () => {
    const s = CONFIG.mobileCloudScale;
    const { sets } = createClouds(fakeStage('mobile'));
    expect(sets.deck.count).toBe(Math.round(CONFIG.clouds.deck * s));
    expect(sets.breakup.count).toBe(Math.round(CONFIG.clouds.breakup * s) + Math.round(FOREGROUND_CARDS * s));
  });

  it('uses one InstancedMesh per texture, side textures for deck/veil and top for breakup', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    expect(meshes(sets.deck.group)).toHaveLength(5);
    expect(meshes(sets.breakup.group)).toHaveLength(5);
    expect(meshes(sets.veil.group)).toHaveLength(5);
    expect(loaded.filter((u) => u.endsWith('_side.webp')).length).toBeGreaterThan(0);
    expect(loaded.filter((u) => u.endsWith('_top.webp')).length).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const a = createClouds(fakeStage('desktop'), 7);
    const b = createClouds(fakeStage('desktop'), 7);
    const c = createClouds(fakeStage('desktop'), 8);
    const first = (x: typeof a) => Array.from(meshes(x.sets.deck.group)[0].instanceMatrix.array.slice(0, 16));
    expect(first(a)).toEqual(first(b));
    expect(first(a)).not.toEqual(first(c));
    const firstTop = (x: typeof a) => Array.from(meshes(x.sets.breakup.group)[0].instanceMatrix.array.slice(0, 16));
    expect(firstTop(a)).toEqual(firstTop(b));
  });

  it('keeps C top at most ~15% of top cards', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const c = meshes(sets.breakup.group).find((m) => m.name.includes('cloud_c'))!;
    expect(c.count / sets.breakup.count).toBeLessThanOrEqual(0.15);
  });

  it('setOpacity drives the shared opacity uniform and the deck mist floor', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    sets.deck.setOpacity(0);
    for (const m of meshes(sets.deck.group)) {
      expect((m.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    }
    const floor = sets.deck.group.getObjectByName('cloud_floor') as THREE.Mesh;
    expect(floor).toBeTruthy();
    expect(floor.position.y).toBeCloseTo(11.9);
    expect((floor.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    expect(sets.deck.group.visible).toBe(false);
    sets.deck.setOpacity(0.5);
    expect((meshes(sets.deck.group)[0].material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);
    expect(sets.deck.group.visible).toBe(true);
  });

  it('sizes card geometry by the texture aspect', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    const g = meshes(sets.deck.group)[0].geometry;
    g.computeBoundingBox();
    const size = new THREE.Vector3();
    g.boundingBox!.getSize(size);
    expect(size.x / size.y).toBeCloseTo(2);
  });

  it('places veil cards on demand (Blender coords to three) up to capacity', () => {
    const { sets } = createClouds(fakeStage('desktop'));
    sets.veil.place([[1, 2, 3, 10], [4, 5, 6, 12]]);
    expect(sets.veil.count).toBe(2);
    expect(total(sets.veil.group)).toBe(2);
    const m = meshes(sets.veil.group).find((x) => x.count > 0)!;
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const found: number[][] = [];
    for (const mesh of meshes(sets.veil.group)) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, mat);
        p.setFromMatrixPosition(mat);
        found.push([p.x, p.y, p.z]);
      }
    }
    expect(m).toBeTruthy();
    expect(found).toContainEqual([1, 3, -2]);
    const many = Array.from({ length: 40 }, (_, i) => [i, 0, 0, 5] as [number, number, number, number]);
    sets.veil.place(many);
    expect(sets.veil.count).toBe(CONFIG.clouds.veil);
  });

  it('update advances the shared time uniform', () => {
    const clouds = createClouds(fakeStage('desktop'));
    const u = (meshes(clouds.sets.deck.group)[0].material as THREE.ShaderMaterial).uniforms.uTime;
    const before = u.value;
    clouds.update(1000, new THREE.PerspectiveCamera());
    expect(u.value).toBeCloseTo(before + 1);
  });

  it('adds all sets to the scene with deck above terrain and breakup above deck', () => {
    const stage = fakeStage('desktop');
    const { sets } = createClouds(stage);
    expect(stage.scene.children).toContain(sets.deck.group);
    const ro = (g: THREE.Group) => Math.min(...meshes(g).map((m) => m.renderOrder));
    expect(ro(sets.deck.group)).toBeGreaterThan(0);
    expect(ro(sets.breakup.group)).toBeGreaterThan(Math.max(...meshes(sets.deck.group).map((m) => m.renderOrder)));
  });
});
