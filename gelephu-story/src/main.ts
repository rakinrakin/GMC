import { CONFIG } from './config';
import { toThree } from './math/coords';
import { sampleTimeline } from './math/timeline';
import { createStage } from './scene/stage';
import { createSky } from './scene/sky';
import { createClouds } from './scene/clouds';
import { loadTerrain } from './scene/terrain';

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);

  const stage = createStage(canvas);
  createSky(stage);

  const clouds = createClouds(stage);

  // Dev only: ?t=<0..1> holds the camera at that point of the timeline (default: the map key) with
  // stepped cloud opacities, for comparing against the approved frames. Task 6 replaces this.
  const tParam = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('t')) : NaN;
  const t = Number.isFinite(tParam) && new URLSearchParams(location.search).has('t')
    ? Math.min(1, Math.max(0, tParam)) : 1;
  clouds.sets.deck.setOpacity(t < 0.3 ? 1 : 0);
  clouds.sets.breakup.setOpacity(t >= 0.3 && t < 0.75 ? 1 : 0);
  const key = sampleTimeline(CONFIG.timeline, t);
  stage.camera.position.set(...toThree(key.pos));
  stage.camera.fov = key.fov;
  stage.camera.updateProjectionMatrix();
  stage.camera.lookAt(...toThree(key.target));

  loadTerrain(stage, () => {}).catch((err) => console.error('Terrain failed to load', err));

  let last = performance.now();
  stage.renderer.setAnimationLoop((now: number) => {
    clouds.update(now - last, stage.camera);
    last = now;
    stage.renderer.render(stage.scene, stage.camera);
  });
}
