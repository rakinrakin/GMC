import * as THREE from 'three';
import { gsap } from 'gsap';
import type { ZoneDef } from '../config';
import { toThree, type Vector3Tuple } from '../math/coords';
import { mulberry32, type CardPlacement } from '../scene/clouds';
import type { TerrainUniforms } from '../scene/terrain';

export interface View {
  pos: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
}

export interface Selection {
  select(id: number): void;
  deselect(): void;
  /** Selected zone id; 0 when nothing is selected (also during the ease back out). */
  current(): number;
  /** True while a select/deselect transition is running. */
  busy(): boolean;
  /**
   * Re-applies the current effects (and the camera, if a zone is selected or easing and camera
   * writes are allowed). Call when the terrain arrives late or the camera is handed back.
   */
  sync(): void;
}

export interface SelectionDeps {
  camera: THREE.PerspectiveCamera;
  zones: ZoneDef[];
  /** Zone centroids, Blender-style (x east, y north) km, by id. */
  centroids: Record<number, [number, number]>;
  /** The map key (pinned) view the selection returns to. */
  mapView: View;
  /** Terrain uniforms; null until the terrain has loaded. */
  uniforms(): TerrainUniforms | null;
  vision(): { setOpacity(v: number): void } | null;
  veil: { place(items: CardPlacement[]): void; setOpacity(v: number): void };
  panel?: { open(zone: ZoneDef): void; close(): void };
  /** Camera writes are skipped while this is false (the scroll timeline owns the camera). */
  cameraAllowed?: () => boolean;
  /** Transition length in seconds (1.6). */
  duration?: number;
  /** Called with the new current() whenever a select or deselect starts. */
  onChange?(id: number): void;
}

const ZONE_FOV = 33.2;
const sameV3 = (a: Vector3Tuple, b: Vector3Tuple) => a.every((v, i) => v === b[i]);

/** The view a zone eases to: its explicit view, or one computed from the centroid if it still carries the map key. */
export function zoneView(zone: ZoneDef, centroid: [number, number] | undefined, mapKey: { pos: Vector3Tuple; target: Vector3Tuple }): View {
  const v = zone.view;
  const isMapKey = sameV3(v.pos, mapKey.pos) && sameV3(v.target, mapKey.target);
  if (!isMapKey || !centroid) return { pos: v.pos, target: v.target, fov: v.fov ?? ZONE_FOV };
  const [cx, cy] = centroid;
  return { target: [cx, cy, 2], pos: [cx - 1.5, cy - 38, 13], fov: ZONE_FOV };
}

/** 16 side cards along the base of the vision (Blender-style [x, y, z, width]). Seeded: same every time. */
export function veilCards(seed = 11): CardPlacement[] {
  const rnd = mulberry32(seed);
  const u = (a: number, b: number) => a + (b - a) * rnd();
  const cards: CardPlacement[] = [];
  for (let x = -75; x <= 75; x += 10) {
    cards.push([x + u(-4, 4), u(96, 108), u(-1, 2), u(26, 40)]);
  }
  return cards;
}

export function createSelection(deps: SelectionDeps): Selection {
  const { camera } = deps;
  const duration = deps.duration ?? 1.6;
  const cameraAllowed = deps.cameraAllowed ?? (() => true);
  const veil = veilCards();

  // Tweened proxies, in three.js coordinates.
  const pose = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: deps.mapView.fov };
  const fx = { focus: 0, vision: 0, cx: 0, cy: 0 };

  let currentId = 0;
  /** Id shown in uSelected: kept through the ease out so other zones un-mute smoothly. */
  let shownId = 0;
  let tl: gsap.core.Timeline | null = null;

  const isBusy = () => tl !== null;

  function applyCamera() {
    if (!cameraAllowed()) return;
    camera.position.set(pose.px, pose.py, pose.pz);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(pose.tx, pose.ty, pose.tz);
  }

  function applyFx() {
    const u = deps.uniforms();
    if (u) {
      u.uSelected.value = shownId;
      u.uFocus.value = fx.focus;
      u.uFocusCenter.value.set(fx.cx, fx.cy);
    }
    deps.vision()?.setOpacity(fx.vision);
    deps.veil.setOpacity(fx.vision);
  }

  /** Start a new transition from the current values of everything. */
  function startFrom() {
    if (tl) {
      tl.kill();
      tl = null;
    } else if (currentId === 0) {
      // Idle on the map: the camera may have been orbited; it always looks at the map key target.
      const [tx, ty, tz] = toThree(deps.mapView.target);
      Object.assign(pose, {
        px: camera.position.x, py: camera.position.y, pz: camera.position.z, tx, ty, tz, fov: camera.fov,
      });
    }
  }

  function poseOf(v: View) {
    const [px, py, pz] = toThree(v.pos);
    const [tx, ty, tz] = toThree(v.target);
    return { px, py, pz, tx, ty, tz, fov: v.fov };
  }

  function run(view: View, effects: Partial<typeof fx>, onComplete?: () => void) {
    const t = gsap.timeline({
      onComplete: () => {
        if (tl === t) tl = null;
        onComplete?.();
        applyFx();
      },
    });
    t.to(pose, { ...poseOf(view), duration, ease: 'power2.inOut', onUpdate: applyCamera }, 0);
    t.to(fx, { ...effects, duration, ease: 'power2.inOut', onUpdate: applyFx }, 0);
    tl = t;
  }

  return {
    select(id) {
      const zone = deps.zones.find((z) => z.id === id);
      // Unknown, already selected, or already easing in to it.
      if (!zone || id === currentId) return;
      startFrom();
      currentId = id;
      shownId = id;
      const centroid = deps.centroids[id];
      const [cx, cy] = centroid ? [centroid[0], -centroid[1]] : [fx.cx, fx.cy];
      // From a clear map the fog centre jumps; mid-focus (retarget) it glides.
      if (fx.focus < 1e-3) Object.assign(fx, { cx, cy });
      if (zone.image) deps.veil.place(veil);
      applyFx();
      deps.panel?.open(zone);
      deps.onChange?.(id);
      run(zoneView(zone, centroid, deps.mapView), { focus: 1, vision: zone.image ? 1 : 0, cx, cy });
    },
    deselect() {
      if (currentId === 0) return;
      startFrom();
      currentId = 0;
      deps.panel?.close();
      deps.onChange?.(0);
      run(deps.mapView, { focus: 0, vision: 0 }, () => {
        shownId = 0;
      });
    },
    current: () => currentId,
    busy: isBusy,
    sync() {
      applyFx();
      // Idle on the map the pose proxy is stale: the orbit controls own the camera then.
      if (currentId !== 0 || isBusy()) applyCamera();
    },
  };
}
