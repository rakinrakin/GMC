import { CONFIG } from './config';
import { toThree } from './math/coords';
import { sampleTimeline } from './math/timeline';
import { createStage } from './scene/stage';
import { createSky } from './scene/sky';
import { createClouds } from './scene/clouds';
import { loadTerrain, type Terrain } from './scene/terrain';
import { createVision } from './scene/vision';
import { createControls } from './interact/controls';
import { createSelection } from './interact/selection';
import { pickZone } from './interact/picking';
import { createHover } from './interact/hover';
import { createMapUi } from './ui/panel';
import zonesJson from '../public/assets/zones.json';
import { Quaternion, Vector2, Vector3 } from 'three';
import { gsap } from 'gsap';
import { createScroll, opacityCurves, approach, captionFor } from './story/scroll';
import { createOverlays } from './story/overlays';

/** Time constant of the camera easing toward the scroll position. */
const SCROLL_SMOOTH_MS = 140;
/** Minimum time between hover raycasts. */
const HOVER_PICK_MS = 50;
/** Leaving the pin, the camera blends from its map pose (orbited / zone view) to the timeline. */
const LEAVE_BLEND_MS = 800;

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);

  const stage = createStage(canvas);
  createSky(stage);

  const clouds = createClouds(stage);

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Hover label and highlight only for a fine pointer that can hover; touch taps select.
  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

  const MAP = CONFIG.timeline[CONFIG.timeline.length - 1];
  const mapView = { pos: MAP.pos, target: MAP.target, fov: MAP.fov };
  const centroids: Record<number, [number, number]> = {};
  for (const z of zonesJson as unknown as Array<{ id: number; centroidKm: [number, number] }>) centroids[z.id] = z.centroidKm;
  const zoneName = (id: number) => CONFIG.zones.find((z) => z.id === id)?.name ?? '';

  let terrain: Terrain | null = null;
  /** Set by scroll onEnd / onLeaveEnd: the map is live only while pinned. */
  let live = false;

  const imageUrl = CONFIG.zones.find((z) => z.image)?.image;
  const vision = imageUrl ? createVision(stage, imageUrl) : null;

  const ui = createMapUi(document.body, {
    zones: CONFIG.zones,
    onClose: () => selection.deselect(),
    onSelect: (id) => {
      // Needs the terrain uniforms; before load a keyboard select would have nothing to show.
      if (live && terrain) selection.select(id);
    },
    onFocusZone: (id) => setHover(live ? id : 0),
  });

  const selection = createSelection({
    camera: stage.camera,
    zones: CONFIG.zones,
    centroids,
    mapView,
    uniforms: () => terrain?.uniforms ?? null,
    vision: () => vision,
    veil: clouds.sets.veil,
    panel: ui,
    // The scroll timeline owns the camera until it has settled on the map key.
    cameraAllowed: () => live && shownT === 1,
    duration: reducedMotion ? 0.01 : 1.6,
    // The map caption gives the sky to the vision while a zone is selected.
    onChange: (id) => overlays.setCaption(captionFor(shownT, id !== 0)),
  });

  function setHover(id: number) {
    if (terrain) terrain.uniforms.uHover.value = id;
  }

  const ndc = new Vector2();
  const toNdc = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    return ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  };
  const pickAt = (x: number, y: number) => (terrain ? pickZone(toNdc(x, y), stage, terrain) : 0);

  const hover = createHover({
    pick: pickAt,
    show: (id, x, y) => {
      setHover(id);
      ui.label(id ? zoneName(id) : null, x, y);
      canvas.style.cursor = id ? 'pointer' : '';
    },
    // No picking while a zone is selected or easing (and none before the map is live).
    active: () => live && selection.current() === 0 && !selection.busy(),
    intervalMs: HOVER_PICK_MS,
  });

  const controls = createControls(stage, CONFIG.limits, {
    target: MAP.target,
    startPos: MAP.pos,
    fov: MAP.fov,
    locked: () => selection.current() !== 0 || selection.busy(),
    onTap: (x, y) => {
      const id = pickAt(x, y);
      if (id) selection.select(id);
    },
    onHover: (x, y) => {
      if (canHover) hover.move(x, y);
    },
    onHoverEnd: () => hover.end(),
  });

  function setLive(on: boolean) {
    live = on;
    controls.enabled = on;
    ui.setActive(on);
    // Drags and pinches belong to the map only while pinned; otherwise touch scrolls the story.
    canvas.style.touchAction = on ? 'none' : '';
    if (!on) hover.end();
  }

  /** Camera pose at the moment the pin was left, blended out over LEAVE_BLEND_MS. */
  let leave: { pos: Vector3; quat: Quaternion; fov: number; k: number } | null = null;

  // Dev only: a handle for console inspection.
  if (import.meta.env.DEV) {
    (window as unknown as { __gmc: unknown }).__gmc = { stage, selection, controls, vision, clouds, gsap, terrain: () => terrain };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && live && selection.current() !== 0) selection.deselect();
  });

  const track = document.createElement('div');
  track.className = 'scroll-track';
  track.setAttribute('aria-hidden', 'true');
  document.body.appendChild(track);

  // Dev only: ?t=<0..1> starts the page scrolled to that point of the story.
  const tRaw = import.meta.env.DEV ? new URLSearchParams(location.search).get('t') : null;
  const tParam = tRaw === null || tRaw === '' ? NaN : Number(tRaw);
  const initialT = Number.isFinite(tParam) ? Math.min(1, Math.max(0, tParam)) : undefined;
  if (initialT !== undefined) history.scrollRestoration = 'manual';

  const overlays = createOverlays(document.body, { onBackToTop: () => scroll.scrollToStart() });
  const scroll = createScroll({
    trackEl: track,
    selection,
    reducedMotion,
    initialT,
    onT: () => {},
    onEnd: () => {
      overlays.setPinned(true);
      leave = null;
      setLive(true);
    },
    onLeaveEnd: () => {
      overlays.setPinned(false);
      const cam = stage.camera;
      leave = reducedMotion ? null : { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, k: 0 };
      setLive(false);
    },
    // The map zooms out first; only a gesture that starts fully zoomed out goes to the story.
    acceptUpwardWheel: () => !controls.consumedLastWheel(),
  });

  // The camera eases toward the scroll position; reduced motion follows it exactly.
  // It starts at the current scroll position (incl. ?t= or scroll restoration), with no ease-up from 0.
  let shownT = scroll.t();
  const applyT = (t: number) => {
    const key = sampleTimeline(CONFIG.timeline, t);
    const cam = stage.camera;
    cam.position.set(...toThree(key.pos));
    cam.lookAt(...toThree(key.target));
    let fov = key.fov;
    if (leave) {
      const e = leave.k * leave.k * (3 - 2 * leave.k);
      cam.position.lerpVectors(leave.pos, cam.position, e);
      cam.quaternion.slerpQuaternions(leave.quat, cam.quaternion, e);
      fov = leave.fov + (key.fov - leave.fov) * e;
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const c = opacityCurves(t);
    clouds.sets.deck.setOpacity(c.deck);
    clouds.sets.breakup.setOpacity(c.breakup);
    overlays.setCaption(captionFor(t, selection.current() !== 0));
  };
  applyT(shownT);

  loadTerrain(stage, () => {})
    .then((t) => {
      terrain = t;
      // A selection made (or finished) before the terrain arrived.
      selection.sync();
    })
    .catch((err) => console.error('Terrain failed to load', err));

  let last = performance.now();
  stage.renderer.setAnimationLoop((now: number) => {
    const dt = now - last;
    const target = scroll.state() === 'pinned' ? 1 : scroll.t();
    if (leave) leave.k = Math.min(1, leave.k + dt / LEAVE_BLEND_MS);
    if (shownT !== target || leave) {
      const wasSettled = shownT === 1;
      shownT = reducedMotion ? target : approach(shownT, target, dt, SCROLL_SMOOTH_MS);
      applyT(shownT);
      if (leave && leave.k >= 1) leave = null;
      // The camera is handed to the map: catch up on any selection that started meanwhile.
      if (!wasSettled && shownT === 1 && live) selection.sync();
    } else if (live && selection.current() === 0 && !selection.busy()) {
      // Map key reached and nothing selected: the orbit controls own the camera.
      controls.update(dt);
    }
    hover.frame(now);
    clouds.update(dt, stage.camera);
    last = now;
    stage.renderer.render(stage.scene, stage.camera);
  });
}
