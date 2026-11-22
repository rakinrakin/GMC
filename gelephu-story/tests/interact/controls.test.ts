// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { toThree } from '../../src/math/coords';
import { createControls, type Controls } from '../../src/interact/controls';
import { createScroll } from '../../src/story/scroll';
import type { Stage } from '../../src/scene/stage';

const MAP = CONFIG.timeline[CONFIG.timeline.length - 1];
const live: Controls[] = [];

function setup(opts: { locked?: () => boolean } = {}) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientHeight', { value: 800 });
  Object.defineProperty(canvas, 'clientWidth', { value: 1200 });
  document.body.appendChild(canvas);
  const camera = new THREE.PerspectiveCamera(MAP.fov, 1.5);
  camera.position.set(...toThree(MAP.pos));
  camera.lookAt(...toThree(MAP.target));
  const stage = { camera, renderer: { domElement: canvas } } as unknown as Stage;
  const onTap = vi.fn();
  const controls = createControls(stage, CONFIG.limits, {
    target: MAP.target, startPos: MAP.pos, fov: MAP.fov, onTap, locked: opts.locked,
  });
  live.push(controls);
  return { canvas, camera, controls, onTap };
}

afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.innerHTML = '';
});

function ptr(el: Element, type: string, id: number, x: number, y: number, pointerType = 'touch') {
  const e = new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}
function wheelOn(el: Element, deltaY: number, ctrlKey = false) {
  const e = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

describe('createControls', () => {
  it('starts at the map key view in orbit terms', () => {
    const { controls } = setup();
    const s = controls.state();
    expect(s.azimuth).toBe(0);
    expect(s.distance).toBeCloseTo(Math.hypot(94, 125), 3);
    expect(s.polar).toBeCloseTo(Math.atan2(94, 125), 3);
  });

  it('Review Focus 2: disabled (before onEnd) ignores pointer, wheel and taps', () => {
    const { canvas, camera, controls, onTap } = setup();
    const before = camera.position.clone();
    ptr(canvas, 'pointerdown', 1, 100, 100);
    ptr(canvas, 'pointermove', 1, 300, 160);
    ptr(canvas, 'pointerup', 1, 300, 160);
    ptr(canvas, 'pointerdown', 2, 100, 100);
    ptr(canvas, 'pointerup', 2, 100, 100);
    const w = wheelOn(canvas, 200);
    controls.update(16);
    expect(controls.state().azimuth).toBe(0);
    expect(controls.state().distance).toBeCloseTo(Math.hypot(94, 125), 3);
    expect(camera.position.equals(before)).toBe(true);
    expect(onTap).not.toHaveBeenCalled();
    expect(w.defaultPrevented).toBe(false);
  });

  it('enabled: drag orbits within limits and tap selects', () => {
    const { canvas, camera, controls, onTap } = setup();
    controls.enabled = true;
    ptr(canvas, 'pointerdown', 1, 100, 100);
    ptr(canvas, 'pointermove', 1, 2000, -2000);
    ptr(canvas, 'pointerup', 1, 2000, -2000);
    const s = controls.state();
    expect(s.azimuth).toBeGreaterThanOrEqual(CONFIG.limits.azimuth[0]);
    expect(s.azimuth).toBeLessThanOrEqual(CONFIG.limits.azimuth[1]);
    expect(Math.abs(s.azimuth)).toBeCloseTo(0.6, 5);
    expect(s.polar).toBeGreaterThanOrEqual(CONFIG.limits.polar[0]);
    expect(s.polar).toBeLessThanOrEqual(CONFIG.limits.polar[1]);
    controls.update(16);
    // The camera still looks at the map key target from distance.
    expect(camera.position.distanceTo(new THREE.Vector3(...toThree(MAP.target)))).toBeCloseTo(s.distance, 3);
    expect(onTap).not.toHaveBeenCalled();

    ptr(canvas, 'pointerdown', 2, 400, 300);
    ptr(canvas, 'pointerup', 2, 402, 301);
    expect(onTap).toHaveBeenCalledWith(402, 301, 'touch');
  });

  it('wheel: down zooms in, up zooms out; consumed until the distance limit', () => {
    const { canvas, controls } = setup();
    controls.enabled = true;
    const d0 = controls.state().distance;
    const e = wheelOn(canvas, 100);
    expect(e.defaultPrevented).toBe(true);
    expect(controls.state().distance).toBeLessThan(d0);
    expect(controls.consumedLastWheel()).toBe(true);
    for (let i = 0; i < 50; i++) wheelOn(canvas, -500);
    expect(controls.state().distance).toBe(CONFIG.limits.distance[1]);
    wheelOn(canvas, -100);
    expect(controls.consumedLastWheel()).toBe(false);
  });

  it('trackpad pinch (ctrl + wheel) is natural: spreading (deltaY < 0) zooms in; always consumed', () => {
    const { canvas, controls } = setup();
    controls.enabled = true;
    const d0 = controls.state().distance;
    const p = wheelOn(canvas, -30, true);
    expect(p.defaultPrevented).toBe(true);
    expect(controls.state().distance).toBeLessThan(d0);
    for (let i = 0; i < 50; i++) wheelOn(canvas, 100, true);
    expect(controls.state().distance).toBe(CONFIG.limits.distance[1]);
    // Pinch-close at the limit still belongs to the map: never unpins.
    wheelOn(canvas, 30, true);
    expect(controls.consumedLastWheel()).toBe(true);
  });

  it('wheel while locked (zone selected) never zooms and the rest of that gesture is swallowed', () => {
    let locked = true;
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const { canvas, controls } = setup({ locked: () => locked });
    controls.enabled = true;
    const d0 = controls.state().distance;
    wheelOn(canvas, -100);
    expect(controls.state().distance).toBe(d0);
    // Not the map's: the scroll controller deselects with it.
    expect(controls.consumedLastWheel()).toBe(false);
    locked = false;
    t += 50;
    wheelOn(canvas, -100);
    expect(controls.state().distance).toBe(d0);
    t += 1000;
    wheelOn(canvas, -100);
    expect(controls.state().distance).toBeGreaterThan(d0);
    vi.restoreAllMocks();
  });

  it('Review Focus 5: the pinch handler calls preventDefault and changes distance', () => {
    const { canvas, controls } = setup();
    controls.enabled = true;
    const d0 = controls.state().distance;
    ptr(canvas, 'pointerdown', 1, 500, 400);
    ptr(canvas, 'pointerdown', 2, 600, 400);
    const m = ptr(canvas, 'pointermove', 2, 700, 400);
    expect(m.defaultPrevented).toBe(true);
    expect(controls.state().distance).toBeLessThan(d0);
  });

  it('springs back to the start view after springBackMs idle', () => {
    const { canvas, controls } = setup();
    controls.enabled = true;
    ptr(canvas, 'pointerdown', 1, 100, 100);
    ptr(canvas, 'pointermove', 1, 300, 100);
    ptr(canvas, 'pointerup', 1, 300, 100);
    const az = controls.state().azimuth;
    expect(az).not.toBe(0);
    controls.update(CONFIG.limits.springBackMs! - 100);
    expect(controls.state().azimuth).toBe(az);
    for (let i = 0; i < 400; i++) controls.update(16);
    expect(Math.abs(controls.state().azimuth)).toBeLessThan(1e-3);
  });

  it('Fix 5: an upward wheel over the zone panel neither unpins nor deselects', () => {
    let y = 0;
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    window.scrollTo = ((a: number | ScrollToOptions, b?: number) => {
      y = typeof a === 'number' ? (b ?? 0) : (a.top ?? y);
      window.dispatchEvent(new Event('scroll'));
    }) as typeof window.scrollTo;
    let selected = 0;
    const { canvas, controls } = setup({ locked: () => selected !== 0 });
    const ui = document.createElement('div');
    ui.className = 'map-ui';
    const panel = document.createElement('section');
    ui.appendChild(panel);
    document.body.appendChild(ui);
    const track = document.createElement('div');
    document.body.appendChild(track);
    const selection = { deselect: vi.fn(() => { selected = 0; }), current: () => selected };
    let clock = 0;
    const scroll = createScroll({
      trackEl: track, selection, onT: () => {}, onLeaveEnd: () => { controls.enabled = false; },
      onEnd: () => { controls.enabled = true; }, now: () => clock, initialT: 1,
      acceptUpwardWheel: () => !controls.consumedLastWheel(),
    });
    expect(scroll.state()).toBe('pinned');
    wheelOn(canvas, 300); // zoom in
    expect(controls.state().distance).toBeLessThan(CONFIG.limits.distance[1]);

    // Zoomed in, nothing selected: wheel up over the UI zooms out, never unpins.
    clock += 1000;
    wheelOn(panel, -40);
    expect(scroll.state()).toBe('pinned');

    // A zone selected: wheel over the panel is the panel's.
    selected = 4;
    clock += 1000;
    wheelOn(panel, -40);
    expect(selection.deselect).not.toHaveBeenCalled();
    expect(scroll.state()).toBe('pinned');

    // The same wheel on the map deselects (as before).
    clock += 1000;
    wheelOn(canvas, -40);
    expect(selection.deselect).toHaveBeenCalledTimes(1);
    expect(scroll.state()).toBe('pinned');
    scroll.destroy();
  });
});
