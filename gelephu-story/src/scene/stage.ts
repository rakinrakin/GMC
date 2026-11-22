import * as THREE from 'three';

export type Tier = 'desktop' | 'mobile';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tier: Tier;
  onResize(cb: (width: number, height: number) => void): void;
}

/** Mobile when the primary pointer is coarse or the screen is narrower than 820 px. */
export function detectTier(coarsePointer: boolean, screenWidth: number): Tier {
  return coarsePointer || screenWidth < 820 ? 'mobile' : 'desktop';
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const coarse = window.matchMedia?.('(pointer:coarse)').matches ?? false;
  const tier = detectTier(coarse, window.screen?.width ?? window.innerWidth);

  // Log depth: near 0.05 km to far 6000 km is too wide a range for a linear 24-bit depth
  // buffer, and the mist plane sits within metres of the low terrain.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The baked colour is already display-ready.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'mobile' ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 6000);

  const callbacks: Array<(w: number, h: number) => void> = [];
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const cb of callbacks) cb(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer,
    scene,
    camera,
    tier,
    onResize(cb) {
      callbacks.push(cb);
    },
  };
}
