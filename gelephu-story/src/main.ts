import { CONFIG } from './config';
import { toThree } from './math/coords';
import { sampleTimeline } from './math/timeline';
import { createStage } from './scene/stage';
import { createSky } from './scene/sky';
import { createClouds } from './scene/clouds';
import { loadTerrain } from './scene/terrain';
import { createScroll, opacityCurves, approach } from './story/scroll';
import { createOverlays } from './story/overlays';

/** Time constant of the camera easing toward the scroll position. */
const SCROLL_SMOOTH_MS = 140;

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);

  const stage = createStage(canvas);
  createSky(stage);

  const clouds = createClouds(stage);

  // Task 7 replaces this stub with the real zone Selection.
  const selection = { deselect: () => {}, current: () => 0 };

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
    onEnd: () => overlays.setPinned(true),
    onLeaveEnd: () => overlays.setPinned(false),
  });

  // The camera eases toward the scroll position; reduced motion follows it exactly.
  // It starts at the current scroll position (incl. ?t= or scroll restoration), with no ease-up from 0.
  let shownT = scroll.t();
  const applyT = (t: number) => {
    const key = sampleTimeline(CONFIG.timeline, t);
    stage.camera.position.set(...toThree(key.pos));
    if (stage.camera.fov !== key.fov) {
      stage.camera.fov = key.fov;
      stage.camera.updateProjectionMatrix();
    }
    stage.camera.lookAt(...toThree(key.target));
    const c = opacityCurves(t);
    clouds.sets.deck.setOpacity(c.deck);
    clouds.sets.breakup.setOpacity(c.breakup);
    overlays.setCaption(c.caption);
  };
  applyT(shownT);

  loadTerrain(stage, () => {}).catch((err) => console.error('Terrain failed to load', err));

  let last = performance.now();
  stage.renderer.setAnimationLoop((now: number) => {
    const dt = now - last;
    const target = scroll.state() === 'pinned' ? 1 : scroll.t();
    if (shownT !== target) {
      shownT = reducedMotion ? target : approach(shownT, target, dt, SCROLL_SMOOTH_MS);
      applyT(shownT);
    }
    clouds.update(dt, stage.camera);
    last = now;
    stage.renderer.render(stage.scene, stage.camera);
  });
}
