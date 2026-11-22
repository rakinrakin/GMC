import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const gltfUrls: string[] = [];
const textureUrls: string[] = [];

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader() { return this; }
    async loadAsync(url: string) {
      gltfUrls.push(url);
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()));
      return { scene };
    }
  },
}));

vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath() { return this; }
  },
}));

vi.mock('../../src/scene/imageData', () => ({
  loadImageData: async (url: string) => {
    textureUrls.push(url);
    return { width: 2, height: 2, data: new Uint8ClampedArray(16), colorSpace: 'srgb' } as unknown as ImageData;
  },
}));

import { createTerrainMaterial, loadTerrain, edgeFactor } from '../../src/scene/terrain';
import { createSky } from '../../src/scene/sky';
import { MIST_COLOR, MIST_HEIGHT } from '../../src/scene/palette';
import type { Stage } from '../../src/scene/stage';

beforeEach(() => {
  gltfUrls.length = 0;
  textureUrls.length = 0;
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async (url: string) => {
    textureUrls.push(url);
    return new THREE.Texture();
  });
});

const fakeStage = (tier: 'desktop' | 'mobile') =>
  ({ tier, scene: new THREE.Scene() }) as unknown as Stage;

describe('terrain material', () => {
  it('exposes the four interaction uniforms', () => {
    const t = new THREE.Texture();
    const { material, uniforms } = createTerrainMaterial({ color: t, normal: t, zones: t });
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(Object.keys(uniforms).sort()).toEqual(['uFocus', 'uFocusCenter', 'uHover', 'uSelected']);
    expect(uniforms.uFocusCenter.value).toBeInstanceOf(THREE.Vector2);
    expect(uniforms.uSelected.value).toBe(0);
    expect(material.uniforms.uHover).toBe(uniforms.uHover);
  });

  it('centres focus on the core zone in three XZ (x, -y)', () => {
    const t = new THREE.Texture();
    const { uniforms } = createTerrainMaterial({ color: t, normal: t, zones: t }, [3, 5]);
    expect(uniforms.uFocusCenter.value.x).toBe(3);
    expect(uniforms.uFocusCenter.value.y).toBe(-5);
  });
});

describe('loadTerrain', () => {
  it('picks the mobile GLB and textures on the mobile tier', async () => {
    const terrain = await loadTerrain(fakeStage('mobile'), () => {});
    expect(gltfUrls).toEqual(['assets/terrain_mobile.glb']);
    expect(textureUrls).toContain('assets/terrain_color_mobile.webp');
    expect(textureUrls).toContain('assets/terrain_normal_mobile.webp');
    expect(terrain.zoneImage.width).toBe(2);
  });

  it('picks the desktop GLB on the desktop tier and adds the mesh to the scene', async () => {
    const stage = fakeStage('desktop');
    const progress: number[] = [];
    const terrain = await loadTerrain(stage, (p) => progress.push(p));
    expect(gltfUrls).toEqual(['assets/terrain_desktop.glb']);
    expect(textureUrls).toContain('assets/terrain_color.webp');
    expect(terrain.mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(stage.scene.children).toContain(terrain.mesh);
    expect(progress[progress.length - 1]).toBe(1);
  });
});

import { detectTier } from '../../src/scene/stage';

describe('detectTier', () => {
  it('is mobile for coarse pointers or screens under 820 px', () => {
    expect(detectTier(true, 1920)).toBe('mobile');
    expect(detectTier(false, 819)).toBe('mobile');
    expect(detectTier(false, 820)).toBe('desktop');
  });
});

describe('terrain edge fade', () => {
  it('fades colour and height to the shared mist over the outer 12% of UV', () => {
    const t = new THREE.Texture();
    const { material } = createTerrainMaterial({ color: t, normal: t, zones: t });
    expect(material.uniforms.uEdge.value).toBeCloseTo(0.12, 6);
    expect(material.uniforms.uMistY.value).toBeCloseTo(MIST_HEIGHT, 6);
    // One mist colour for terrain edge, focus fog and the sky's mist disc.
    expect(material.uniforms.uMist).toBe(MIST_COLOR);
    const sky = createSky({ scene: new THREE.Scene() } as unknown as Stage);
    expect((sky.mist.material as THREE.ShaderMaterial).uniforms.uMist).toBe(MIST_COLOR);
    expect(material.vertexShader).toContain('uEdge');
    expect(material.fragmentShader).toContain('uEdge');
  });
  it('the far edge (v → 1) has a wider band that ends before the 16:9 frame top (v ≈ 0.80)', () => {
    const t = new THREE.Texture();
    const { material } = createTerrainMaterial({ color: t, normal: t, zones: t });
    expect(material.uniforms.uEdgeFar.value).toBeGreaterThan(0.12);
    expect(edgeFactor(0.5, 0.8)).toBe(1);
    expect(edgeFactor(0.5, 0.9)).toBeLessThan(edgeFactor(0.5, 0.1));
  });
  it('edgeFactor: 0 at the boundary, 1 from 12% inward', () => {
    expect(edgeFactor(0, 0.5)).toBe(0);
    expect(edgeFactor(0.5, 1)).toBe(0);
    expect(edgeFactor(0.12, 0.5)).toBe(1);
    expect(edgeFactor(0.5, 0.5)).toBe(1);
    const mid = edgeFactor(0.06, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(edgeFactor(0.97, 0.5)).toBeCloseTo(edgeFactor(0.03, 0.5), 9);
    expect(edgeFactor(0.5, 0.03)).toBeCloseTo(edgeFactor(0.03, 0.5), 9);
  });
});
