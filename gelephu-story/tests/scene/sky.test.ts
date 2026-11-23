import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { createSky, MIST_FADE, MIST_RADIUS, mistColorAt } from '../../src/scene/sky';
import type { Stage } from '../../src/scene/stage';

const stage = () => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }) as unknown as Stage;

describe('sky horizon seam', () => {
  it('the mist is a disc whose colour fades to the sky horizon colour over at least the last 40% of its radius', () => {
    const { mist, dome } = createSky(stage());
    const mat = mist.material as THREE.ShaderMaterial;
    expect(mat.isShaderMaterial).toBe(true);
    expect((mat.uniforms.uMist.value as THREE.Color).getHexString()).toBe(new THREE.Color(CONFIG.colors.mist).getHexString());
    const horizon = (mat.uniforms.uHorizon.value as THREE.Color).getHexString();
    expect(horizon).toBe(new THREE.Color(CONFIG.colors.skyHorizon).getHexString());
    // The dome's lowest band is the same colour the mist fades to.
    expect(((dome.material as THREE.ShaderMaterial).uniforms.uHorizon.value as THREE.Color).getHexString()).toBe(horizon);
    expect(MIST_FADE[0]).toBeLessThanOrEqual(0.6);
    expect(MIST_FADE[1]).toBeLessThanOrEqual(1);
    expect(mist.geometry.type).toBe('CircleGeometry');
  });
  it('the fade starts beyond the terrain (corners ~155 km from the centre)', () => {
    expect(MIST_FADE[0] * MIST_RADIUS).toBeGreaterThanOrEqual(155);
  });
  it('mistColorAt: mist colour inside the fade start, horizon colour at the rim', () => {
    const mistC = new THREE.Color(CONFIG.colors.mist);
    const hor = new THREE.Color(CONFIG.colors.skyHorizon);
    expect(mistColorAt(0).equals(mistC)).toBe(true);
    expect(mistColorAt(MIST_FADE[0] - 0.01).equals(mistC)).toBe(true);
    expect(mistColorAt(1).getHexString()).toBe(hor.getHexString());
    const mid = mistColorAt(0.8);
    expect(mid.r).toBeGreaterThan(mistC.r);
    expect(mid.r).toBeLessThan(hor.r);
  });
});
