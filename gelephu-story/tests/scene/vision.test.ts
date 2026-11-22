import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { toThree } from '../../src/math/coords';
import { createVision, VISION } from '../../src/scene/vision';
import type { Stage } from '../../src/scene/stage';

vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());

describe('createVision', () => {
  const stage = { scene: new THREE.Scene() } as unknown as Stage;
  const v = createVision(stage, 'assets/project_spire.webp');

  it('is a 150 km plane at the image aspect, centred at (−12, 125, 15.5)', () => {
    const p = v.mesh.geometry.parameters as { width: number; height: number };
    expect(p.width).toBe(150);
    expect(p.height).toBeCloseTo(150 * 1082 / 1942, 6);
    expect(v.mesh.position.toArray()).toEqual(toThree(VISION.center));
    expect(stage.scene.children).toContain(v.mesh);
  });

  it('is vertical and faces the Gelephu core camera', () => {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(v.mesh.quaternion);
    expect(n.y).toBeCloseTo(0, 6);
    const cam = new THREE.Vector3(...toThree(CONFIG.zones[0].view.pos)).sub(v.mesh.position).setY(0).normalize();
    expect(n.dot(cam)).toBeCloseTo(1, 6);
  });

  it('setOpacity drives the uniform and hides the mesh at 0', () => {
    expect(v.mesh.visible).toBe(false);
    v.setOpacity(0.4);
    expect((v.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.4);
    expect(v.mesh.visible).toBe(true);
    v.setOpacity(0);
    expect(v.mesh.visible).toBe(false);
  });

  it('shader includes the log-depth and colour-space chunks and the edge fades', () => {
    const m = v.mesh.material as THREE.ShaderMaterial;
    expect(m.vertexShader).toContain('logdepthbuf_vertex');
    expect(m.fragmentShader).toContain('logdepthbuf_fragment');
    expect(m.fragmentShader).toContain('colorspace_fragment');
    expect(m.fragmentShader).toContain('smoothstep(0.0, 0.16, vUv.x)');
    expect(m.fragmentShader).toContain('smoothstep(1.0, 0.66, vUv.x)');
    expect(m.fragmentShader).toContain('smoothstep(0.02, 0.30, vUv.y)');
    expect(m.fragmentShader).toContain('smoothstep(1.0, 0.80, vUv.y)');
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
  });
});
