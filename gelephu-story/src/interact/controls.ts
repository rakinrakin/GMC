import * as THREE from 'three';
import type { Limits } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import { clampOrbit, springTowards } from '../math/orbit';
import type { Stage } from '../scene/stage';
import type { Framing } from '../math/framing';

export interface OrbitState {
  /** Radians around the start view (0 = start). */
  azimuth: number;
  /** Radians from vertical. */
  polar: number;
  /** km from the target. */
  distance: number;
}

export interface ControlsOptions {
  /** Orbit target and start camera position, Blender-style km (the map key). */
  target: Vector3Tuple;
  startPos: Vector3Tuple;
  /** Field of view written while the controls own the camera. */
  fov: number;
  /**
   * Aspect-aware framing: the fov written and a multiplier on the camera distance. Orbit state
   * and the distance limits stay in 16:9 units, so the limits scale with it. Default: none.
   */
  framing?: () => Framing;
  /** True while something else (the zone selection) owns the camera: no orbit or zoom. */
  locked?: () => boolean;
  /** A press and release without a drag (mouse click or touch tap). */
  onTap?(clientX: number, clientY: number, pointerType: string): void;
  /** Mouse moving over the canvas with no button held. */
  onHover?(clientX: number, clientY: number): void;
  onHoverEnd?(): void;
  /** Elements whose wheel events count as map input (the zone panel). Default: inside `.map-ui`. */
  isMapUi?: (el: Element) => boolean;
}

export interface Controls {
  /** False until the story pins at the map key (scroll onEnd); every input is a no-op until then. */
  enabled: boolean;
  /** Writes the camera from the orbit state (call only while the controls own the camera). */
  update(dtMs: number): void;
  state(): OrbitState;
  /** Whether the latest wheel event was used by the map (false: it may go to the scroll controller). */
  consumedLastWheel(): boolean;
  reset(): void;
  destroy(): void;
}

/** Wheel events closer together than this are one gesture (matches the scroll controller). */
const GESTURE_GAP_MS = 250;
/** A press that moves less than this many px is a tap. */
const TAP_SLOP_PX = 6;
/** Radians of orbit per px of drag, scaled by canvas height. */
const ROTATE_PER_VIEWPORT = 2.2;
/** Distance multiplier per px of wheel delta: exp(delta·k). Pinch wheels (ctrl) are coarser. */
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.01;
const SPRING_HALF_LIFE_MS = 450;

export function createControls(stage: Pick<Stage, 'camera' | 'renderer'>, limits: Limits, opts: ControlsOptions): Controls {
  const { camera } = stage;
  const canvas = stage.renderer.domElement;
  const locked = opts.locked ?? (() => false);
  const isMapUi = opts.isMapUi ?? ((el: Element) => el.closest('.map-ui') !== null);

  const target = new THREE.Vector3(...toThree(opts.target));
  const offset0 = new THREE.Vector3(...toThree(opts.startPos)).sub(target);
  const start = new THREE.Spherical().setFromVector3(offset0);
  const startState: OrbitState = { azimuth: 0, polar: start.phi, distance: start.radius };

  let s: OrbitState = { ...startState };
  let enabled = false;
  let idleMs = 0;
  let consumed = false;
  const wheelGesture = { last: -Infinity, swallow: false };

  const pointers = new Map<number, { x: number; y: number }>();
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  let pinchSpan = 0;

  const set = (next: OrbitState) => {
    s = clampOrbit(next, limits);
    idleMs = 0;
  };

  function reset() {
    s = { ...startState };
    idleMs = 0;
    pointers.clear();
    press = null;
  }

  const span = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(e: PointerEvent) {
    if (!enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable (synthetic) */
    }
    if (pointers.size === 1) {
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else {
      press = null; // a second finger: never a tap
      if (pointers.size === 2) pinchSpan = span();
    }
    idleMs = 0;
  }

  function onPointerMove(e: PointerEvent) {
    if (!enabled) return;
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && e.buttons === 0) opts.onHover?.(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (press && press.id === e.pointerId
      && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) press.moved = true;

    if (pointers.size >= 2) {
      // Pinch: page zoom is never wanted here.
      e.preventDefault();
      const now = span();
      if (!locked() && pinchSpan > 0 && now > 0) set({ ...s, distance: (s.distance * pinchSpan) / now });
      pinchSpan = now;
      return;
    }
    if (press?.moved && !locked()) {
      e.preventDefault();
      const k = ROTATE_PER_VIEWPORT / Math.max(1, canvas.clientHeight || window.innerHeight);
      set({ azimuth: s.azimuth - dx * k, polar: s.polar - dy * k, distance: s.distance });
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (enabled && press && press.id === e.pointerId && !press.moved && e.type === 'pointerup') {
      opts.onTap?.(e.clientX, e.clientY, e.pointerType);
    }
    press = null;
    if (pointers.size === 2) pinchSpan = span();
  }

  function onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse') opts.onHoverEnd?.();
  }

  function onWheel(e: WheelEvent) {
    consumed = false;
    if (!enabled) return;
    const onCanvas = e.target === canvas;
    const onUi = !onCanvas && e.target instanceof Element && isMapUi(e.target);
    if (!onCanvas && !onUi) return;
    e.preventDefault(); // no page scroll and no browser pinch zoom while the map is live
    const now = performance.now();
    const sameGesture = now - wheelGesture.last <= GESTURE_GAP_MS;
    wheelGesture.last = now;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;

    if (e.ctrlKey) {
      // Trackpad pinch: always the map's (never deselects or unpins). Natural direction:
      // spreading (deltaY < 0) zooms in.
      consumed = true;
      if (!locked()) set({ ...s, distance: s.distance * Math.exp(dy * PINCH_WHEEL_ZOOM) });
      return;
    }
    if (locked()) {
      // A zone is selected: nothing in this gesture may zoom. On the map the scroll controller
      // deselects with it; over the zone panel it belongs to the panel.
      wheelGesture.swallow = true;
      consumed = onUi;
      return;
    }
    if (wheelGesture.swallow && sameGesture) {
      consumed = true;
      return;
    }
    wheelGesture.swallow = false;
    // Upward at the zoom-out limit: not ours (the scroll controller may unpin).
    if (dy < 0 && s.distance >= limits.distance[1]) return;
    consumed = true;
    // Scroll down = go deeper.
    set({ ...s, distance: s.distance * Math.exp(-dy * WHEEL_ZOOM) });
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  // Capture on window: runs before the scroll controller's window listener sees the same event.
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });

  const sph = new THREE.Spherical();
  const tmp = new THREE.Vector3();

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v: boolean) {
      if (v === enabled) return;
      enabled = v;
      reset();
    },
    update(dtMs: number) {
      if (!enabled) return;
      if (locked()) {
        // The selection owns the camera and returns it to the start view.
        s = { ...startState };
        idleMs = 0;
        return;
      }
      idleMs += dtMs;
      if (limits.springBackMs !== null && idleMs > limits.springBackMs && pointers.size === 0) {
        s = {
          azimuth: springTowards(s.azimuth, startState.azimuth, dtMs, SPRING_HALF_LIFE_MS),
          polar: springTowards(s.polar, startState.polar, dtMs, SPRING_HALF_LIFE_MS),
          distance: springTowards(s.distance, startState.distance, dtMs, SPRING_HALF_LIFE_MS),
        };
      }
      const f = opts.framing?.() ?? { fov: opts.fov, distanceScale: 1 };
      sph.set(s.distance * f.distanceScale, s.polar, start.theta + s.azimuth);
      camera.position.copy(tmp.setFromSpherical(sph).add(target));
      if (camera.fov !== f.fov) {
        camera.fov = f.fov;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(target);
    },
    state: () => ({ ...s }),
    consumedLastWheel: () => consumed,
    reset,
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('wheel', onWheel, { capture: true });
    },
  };
}
