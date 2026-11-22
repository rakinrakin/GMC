# GMC shared 3D kit (`gmc-kit.js` v1.0.0)

`design.md` in code. Both designers **import** this file in every model. Nothing gets copied out of it. One change here reaches every model.

## See it

```powershell
node tools/serve.mjs
```

Open http://localhost:5173/shared/gmc-kit-preview.html. That's the **Material Board**: every `M_*` material on one plinth under the shared rig, with DUSK/DAY, MATERIAL/CLAY, views V1–V5, Validate and Export GLB.
Keys: `1–5` views · `D` dusk/day · `C` clay · `L` labels · `V` validate. Textures take a few seconds to build on load.

## Start a model

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
<script type="module">
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStage, createPlinth, metricUV } from './gmc-kit.js';

const stage = createStage({ container: document.body, mood: 'dusk' });
const M = stage.materials;                         // the M_* library: never make your own

const root = new THREE.Group(); root.name = 'gmc_obj_o0-bridge';   // design.md §9.2
const structure = new THREE.Group(); structure.name = 'L_structure'; root.add(structure);

// UVs in metres; timber grain follows the beam's long axis
const beam = new THREE.Mesh(metricUV(new RoundedBoxGeometry(24, .5, .5, 4, .06), { along: 'x' }), M.M_timber_cedar);
beam.position.y = 6; structure.add(beam);

root.add(createPlinth(M, { width: 60 }));          // floating-diorama plinth, top at y = 0
stage.add(root);                                    // frames it in V2, shadows on

console.log(stage.validate(root));                  // { ok, errors, warnings, stats }
// stage.exportGLB(root)  ·  stage.setMood('day')  ·  stage.setClay(true)  ·  stage.setView('V4')
</script>
```

When you build with the `ui-3d-element` skill, keep the skill's quality bar and shell. Swap its studio, background, lights and post for `createStage()`, or for the individual pieces below. When publishing the model as an artifact, publish `gmc-kit.js` alongside it as a supporting file (`files: { "gmc-kit.js": "shared/gmc-kit.js" }`).

## What's inside

| Export | What it does | design.md |
|---|---|---|
| `TOKENS`, `GLOW_RAMP` | Every colour, as hex numbers | §2 |
| `MOODS`, `sunDirection()` | DUSK / DAY light, exposure, bloom, glow, fog, background values | §4 |
| `createMaterials({renderer, quality})` | The `M_*` library with procedural, seamlessly tiling textures (seed 1337) | §3.2 |
| `MATERIAL_NAMES`, `variant(mat, params)` | Allowed names; a variant keeps the library name (e.g. ripe paddy) | §3.2 |
| `metricUV(geo, {along})`, `scaleUV(geo, u, v)` | UVs in metres, so texture scale matches across models | §3.1 |
| `jitterInstanceColors(instancedMesh)` | Canopy colour jitter for instanced trees | §3.2 |
| `gmcEnvironment(pmrem, mood)`, `createRig(scene)`, `createBackground(mood)` | Environment map, key + hemisphere lights, the "void" background | §4 |
| `createStage(opts)` | Everything above + renderer, ACES, MSAA, bloom, shadow catcher, orbit (zoom to cursor), views V1–V5, clay mode, FPS auto-downgrade | §4, §8.5 |
| `createPlinth`, `createSkirt`, `roundedRect` | Floating-diorama plinth and the stratified terrain skirt (also for the map slab) | §5.2, §6.3 |
| `createAnchor`, `createGhostShadow` | Map anchor ring + leader line; soft shadow under floating heroes | §5.3, §6.3 |
| `validateModel(root)` | Checks naming, layers, materials, lights/cameras, triangle budget, units and pivot | §8, §9, §11 |
| `createMeta(root, opts)`, `downloadJSON` | Pre-filled `.meta.json` sidecar | §9.4 |
| `exportGLB(root)` | GLB export (clay is switched off first) | §9.5 |
| `RECIPES`, `createNoise`, `paint`, `heightToNormal` | Texture recipes and noise, for adding new materials to the kit | §3 |

## Clouds (`gmc-clouds.js`)

Volumetric cloud deck for the map (E5). `const clouds = await createCloudLayer(renderer)`. Each frame: `clouds.update(dt, camera)`, render your scene into a target that has a `DepthTexture`, `clouds.render(camera, target.depthTexture)`, then composite with `clouds.compositeShader(target.texture)` in a `ShaderPass` (set `pass.uniforms.tScene.value` again after constructing it, because ShaderPass drops render-target textures). `setMood('golden'|'dusk'|'day')`, `setCoverage(0..1)`, `setCirrus(0..1)`, `setDrift(speed)` (0 freezes the clouds). Since 1.2.0: `setClear({ half, corner, inset, soft, amount })` keeps a rounded-rect zone at the origin clear of cloud (off by default), used by the map experience so the slab floats in a cloud sea. `createSky()` gives the matching sky dome. Working example: `models/environment/gmc_env_e5-clouds_v01.html`.

## Rules of thumb

- **Units are metres. North is −Z. The pivot is at ground contact.** The validator checks the last two loosely.
- Put emissive window cards in `L_glow` and use `M_window_glow`. The mood switch drives them.
- To change a material or light: change the kit **and** design.md, bump `KIT_VERSION`, and tell the other designer.
- Texture build cost: about 3–6 s at `quality: 'high'` (1024²). Use `'low'` (512²) while iterating.
