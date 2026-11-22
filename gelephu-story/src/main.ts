import { CONFIG } from './config';
import { toThree } from './math/coords';
import { sampleTimeline } from './math/timeline';
import { createStage } from './scene/stage';
import { createSky } from './scene/sky';
import { loadTerrain } from './scene/terrain';

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);

  const stage = createStage(canvas);
  createSky(stage);

  // For now: hold the camera on the final (map) key so it can be compared with the approved frame.
  const key = sampleTimeline(CONFIG.timeline, 1);
  stage.camera.position.set(...toThree(key.pos));
  stage.camera.fov = key.fov;
  stage.camera.updateProjectionMatrix();
  stage.camera.lookAt(...toThree(key.target));

  loadTerrain(stage, () => {}).catch((err) => console.error('Terrain failed to load', err));

  stage.renderer.setAnimationLoop(() => stage.renderer.render(stage.scene, stage.camera));
}
