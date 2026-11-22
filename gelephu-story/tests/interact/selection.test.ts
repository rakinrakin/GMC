import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { CONFIG } from '../../src/config';
import { toThree } from '../../src/math/coords';
import { createSelection, zoneView } from '../../src/interact/selection';
import type { TerrainUniforms } from '../../src/scene/terrain';

// Drive gsap by hand: remove the rAF ticker and step the root timeline explicitly.
let clock = 0;
const step = (s: number) => {
  clock += s;
  gsap.updateRoot(clock);
};
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  clock = gsap.globalTimeline.time() + 1;
  gsap.updateRoot(clock);
});
afterAll(() => {
  gsap.ticker.add(gsap.updateRoot);
});

const MAP = CONFIG.timeline[CONFIG.timeline.length - 1];
const centroids: Record<number, [number, number]> = { 1: [9.181, -7.768], 2: [-5.134, -3.771] };

function setup() {
  const camera = new THREE.PerspectiveCamera(MAP.fov);
  camera.position.set(...toThree(MAP.pos));
  const uniforms: TerrainUniforms = {
    uHover: { value: 0 },
    uSelected: { value: 0 },
    uFocus: { value: 0 },
    uFocusCenter: { value: new THREE.Vector2() },
  };
  const vision = { setOpacity: vi.fn() };
  const veil = { place: vi.fn(), setOpacity: vi.fn() };
  const panel = { open: vi.fn(), close: vi.fn() };
  const sel = createSelection({
    camera,
    zones: CONFIG.zones,
    centroids,
    mapView: { pos: MAP.pos, target: MAP.target, fov: MAP.fov },
    uniforms: () => uniforms,
    vision: () => vision,
    veil,
    panel,
    duration: 1.6,
  });
  return { camera, uniforms, vision, veil, panel, sel };
}

/** Live (not killed, not finished) gsap tweens on the selection's effects proxy (it carries the vision opacity). */
const visionTweens = () =>
  gsap.globalTimeline.getChildren(true, true, false)
    .filter((t) => t.progress() < 1 && t.targets().some((o: object) => 'vision' in o));

describe('zoneView', () => {
  it('uses the explicit view for Gelephu core', () => {
    expect(zoneView(CONFIG.zones[0], centroids[1], MAP)).toEqual({ ...CONFIG.zones[0].view, fov: 33.2 });
  });
  it('computes a view for zones that still carry the map key', () => {
    const [cx, cy] = centroids[2];
    expect(zoneView(CONFIG.zones[1], centroids[2], MAP)).toEqual({
      target: [cx, cy, 2], pos: [cx - 1.5, cy - 38, 13], fov: 33.2,
    });
  });
});

describe('createSelection', () => {
  it('select(1) eases in: uSelected, focus, centre, vision, veil, panel', () => {
    const { sel, uniforms, vision, veil, panel, camera } = setup();
    sel.select(1);
    expect(sel.current()).toBe(1);
    expect(sel.busy()).toBe(true);
    expect(uniforms.uSelected.value).toBe(1);
    expect(panel.open).toHaveBeenCalledWith(CONFIG.zones[0]);
    expect(veil.place).toHaveBeenCalledTimes(1);
    expect(veil.place.mock.calls[0][0]).toHaveLength(16);
    step(2);
    expect(sel.busy()).toBe(false);
    expect(uniforms.uFocus.value).toBeCloseTo(1, 5);
    expect(uniforms.uFocusCenter.value.x).toBeCloseTo(9.181, 3);
    expect(uniforms.uFocusCenter.value.y).toBeCloseTo(7.768, 3);
    expect(vision.setOpacity).toHaveBeenLastCalledWith(1);
    expect(veil.setOpacity).toHaveBeenLastCalledWith(1);
    const [px, py, pz] = toThree(CONFIG.zones[0].view.pos);
    expect(camera.position.x).toBeCloseTo(px, 3);
    expect(camera.position.y).toBeCloseTo(py, 3);
    expect(camera.position.z).toBeCloseTo(pz, 3);
    expect(camera.fov).toBeCloseTo(33.2, 3);
  });

  it('Review Focus 3: select(1) then select(2) mid-tween retargets cleanly', () => {
    const { sel, uniforms, vision } = setup();
    sel.select(1);
    step(0.5);
    const midFocus = uniforms.uFocus.value;
    expect(midFocus).toBeGreaterThan(0);
    expect(midFocus).toBeLessThan(1);
    sel.select(2);
    expect(sel.current()).toBe(2);
    expect(uniforms.uSelected.value).toBe(2);
    expect(visionTweens()).toHaveLength(1);
    step(0.05);
    // Starts from the current values: no jump back to 0.
    expect(uniforms.uFocus.value).toBeGreaterThanOrEqual(midFocus - 1e-6);
    step(2);
    expect(sel.current()).toBe(2);
    expect(sel.busy()).toBe(false);
    expect(uniforms.uSelected.value).toBe(2);
    expect(uniforms.uFocus.value).toBeCloseTo(1, 5);
    // Zone 2 has no image: the vision fades out.
    expect(vision.setOpacity).toHaveBeenLastCalledWith(0);
    expect(visionTweens()).toHaveLength(0);
  });

  it('deselect() reverses to the map key and clears uSelected at the end', () => {
    const { sel, uniforms, vision, panel, camera } = setup();
    sel.select(1);
    step(2);
    sel.deselect();
    expect(sel.current()).toBe(0);
    expect(panel.close).toHaveBeenCalledTimes(1);
    expect(uniforms.uSelected.value).toBe(1); // held while the mute fades
    step(2);
    expect(uniforms.uSelected.value).toBe(0);
    expect(uniforms.uFocus.value).toBeCloseTo(0, 5);
    expect(vision.setOpacity).toHaveBeenLastCalledWith(0);
    const [px, py, pz] = toThree(MAP.pos);
    expect(camera.position.x).toBeCloseTo(px, 3);
    expect(camera.position.y).toBeCloseTo(py, 3);
    expect(camera.position.z).toBeCloseTo(pz, 3);
    expect(camera.fov).toBeCloseTo(MAP.fov, 3);
    expect(sel.busy()).toBe(false);
  });

  it('camera writes are skipped while cameraAllowed() is false', () => {
    const camera = new THREE.PerspectiveCamera(MAP.fov);
    camera.position.set(...toThree(MAP.pos));
    const sel = createSelection({
      camera, zones: CONFIG.zones, centroids, mapView: { pos: MAP.pos, target: MAP.target, fov: MAP.fov },
      uniforms: () => null, vision: () => null, veil: { place: vi.fn(), setOpacity: vi.fn() },
      cameraAllowed: () => false, duration: 1.6,
    });
    sel.select(1);
    step(2);
    expect(camera.position.toArray()).toEqual(toThree(MAP.pos));
  });

  it('sync() applies effects and the camera after a late terrain / camera hand-back', () => {
    const camera = new THREE.PerspectiveCamera(MAP.fov);
    camera.position.set(...toThree(MAP.pos));
    let uniforms: TerrainUniforms | null = null;
    let allowed = false;
    const sel = createSelection({
      camera, zones: CONFIG.zones, centroids, mapView: { pos: MAP.pos, target: MAP.target, fov: MAP.fov },
      uniforms: () => uniforms, vision: () => null, veil: { place: vi.fn(), setOpacity: vi.fn() },
      cameraAllowed: () => allowed, duration: 1.6,
    });
    sel.select(1);
    step(2);
    expect(sel.busy()).toBe(false);
    uniforms = {
      uHover: { value: 0 }, uSelected: { value: 0 }, uFocus: { value: 0 }, uFocusCenter: { value: new THREE.Vector2() },
    };
    allowed = true;
    sel.sync();
    expect(uniforms.uSelected.value).toBe(1);
    expect(uniforms.uFocus.value).toBeCloseTo(1, 5);
    expect(uniforms.uFocusCenter.value.x).toBeCloseTo(9.181, 3);
    expect(uniforms.uFocusCenter.value.y).toBeCloseTo(7.768, 3);
    const [px, py, pz] = toThree(CONFIG.zones[0].view.pos);
    expect(camera.position.toArray().map((v) => +v.toFixed(3))).toEqual([px, py, pz]);
    expect(camera.fov).toBeCloseTo(33.2, 3);
  });

  it('sync() while idle on the map leaves the camera to the orbit controls', () => {
    const { sel, camera } = setup();
    camera.position.set(1, 2, 3);
    sel.sync();
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('onChange reports select and deselect (caption hide/restore hook)', () => {
    const onChange = vi.fn();
    const camera = new THREE.PerspectiveCamera(MAP.fov);
    const sel = createSelection({
      camera, zones: CONFIG.zones, centroids, mapView: { pos: MAP.pos, target: MAP.target, fov: MAP.fov },
      uniforms: () => null, vision: () => null, veil: { place: vi.fn(), setOpacity: vi.fn() }, onChange,
    });
    sel.select(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
    sel.deselect();
    expect(onChange).toHaveBeenLastCalledWith(0);
    step(2);
  });
});
