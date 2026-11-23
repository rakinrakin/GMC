# Gelephu clouds-to-relief web build: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone full-screen page where scrolling descends from a cloud sea onto a white plaster relief of Gelephu, and clicking a maroon zone eases in and raises that project's image behind the clouds.

**Architecture:** An offline Blender/Python pipeline turns `relief-test/` data into web assets: terrain GLBs, a baked lighting texture, a normal map, a zone ID map, cloud WebPs and the project image. A Vite + TypeScript + three.js app loads them into one scene. Pure modules (timeline, orbit clamp, zone decode) are unit-tested; scene modules consume them. A single `config.ts` holds every tunable value.

**Tech Stack:** Vite 5, TypeScript 5, three.js 0.170.x (pinned), gsap 3.12 (ScrollTrigger), Vitest; Blender 5.2 headless + Python (numpy, Pillow) for assets.

**Spec:** `docs/superpowers/specs/2026-11-22-gelephu-cloud-to-relief-design.md`

## Global Constraints

- All new code lives in `gelephu-story/`; nothing outside it is modified (except reading `relief-test/`).
- Standalone full-screen page: a fixed full-viewport canvas behind a scroll track of 4 viewport heights for beats 1→3; after the track, page scroll stops and the map is interactive.
- Initial download < 12 MB desktop, < 7 MB mobile; < ~40 draw calls; pixel ratio capped at 2 (1.5 on mobile).
- Zone colour is Bhutanese maroon `#4A0E16` (linear ≈ 0.15, 0.018, 0.028); plaster `#DCDCDA`; mist/far colour `#D6DCE6`.
- Terrain height exaggeration 2.6×; surroundings shaped exactly as frame 3 v4 (`soft = blur(inside, 52 px)·1.8` smoothstepped; heights `(E−150)·(0.45+0.55·soft)·edge`).
- Placeholder copy only; unnamed zones are labelled "Zone N"; the spire zone is named "Gelephu core".
- `prefers-reduced-motion` honoured; no-WebGL users get a static fallback; zones are reachable by keyboard.
- Accuracy note text (shown in the page footer): "Terrain: open elevation data (~30 m), height ×2.6. GMC outline and zones traced from reference map, aligned to the Bhutan–India border (median error ~300 m); not survey-accurate."

## Review Focus

1. **Window resize or phone rotation mid-scroll** should keep the camera on the same timeline position and not break the aspect ratio. Test in Task 6.
2. **Clicking or hovering during the descent** (before the map is interactive) should do nothing. Test in Task 7.
3. **Clicking a second zone while the first transition is still running** should retarget cleanly to the newest zone, with no stuck fog or doubled vision. Test in Task 7.
4. **Scrolling back up while a zone is selected** should deselect first, then let the timeline run. Test in Task 6.
5. **On touch devices, dragging the map must not scroll the page**, and pinching must not zoom the browser. Test in Task 7.

---

## File map

```
gelephu-story/
  package.json, tsconfig.json, vite.config.ts, index.html
  tools/
    export_assets.py          # Blender headless: terrain GLBs + baked colour (Task 2)
    build_maps.py             # numpy/Pillow: normal map, zone ID map, cloud & image WebPs (Task 2)
    test_assets.py            # asserts on generated assets (Task 2)
  public/assets/              # generated output (git-tracked, small)
  src/
    config.ts                 # all tunables + zone definitions (Task 1)
    math/timeline.ts          # keyframe sampling (Task 3)
    math/orbit.ts             # clamp + spring (Task 3)
    math/zones.ts             # ID-colour <-> zone index (Task 3)
    scene/stage.ts            # renderer, camera, resize, device tier (Task 4)
    scene/terrain.ts          # terrain mesh + shader (Task 4)
    scene/sky.ts              # sky gradient + mist ground (Task 4)
    scene/clouds.ts           # instanced cloud card sets (Task 5)
    scene/vision.ts           # project image plane (Task 7)
    story/scroll.ts           # scroll track -> timeline t, pin/unpin (Task 6)
    story/overlays.ts         # captions, title, back-to-top (Task 6)
    interact/controls.ts      # clamped orbit/zoom input (Task 7)
    interact/picking.ts       # raycast -> UV -> zone id (Task 7)
    interact/selection.ts     # select/deselect state machine (Task 7)
    ui/panel.ts, ui/loader.ts, ui/fallback.ts   (Tasks 7, 8)
    main.ts
  tests/ (*.test.ts, mirrors src/)
```

---

### Task 1: Scaffold and config

**Files:** Create `gelephu-story/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.ts,src/config.ts}`, `tests/config.test.ts`

**Interfaces — Produces:**
```ts
export interface CamKey { t: number; pos: [number,number,number]; target: [number,number,number]; fov: number }
export interface ZoneDef { id: number; name: string; view: { pos: [number,number,number]; target: [number,number,number] }; image?: string; copy: string }
export interface Limits { azimuth: [number,number]; polar: [number,number]; distance: [number,number]; springBackMs: number | null }
export const CONFIG: { timeline: CamKey[]; limits: Limits; colors: {...}; fog: { near: number; far: number }; clouds: { deck: number; breakup: number; veil: number }; mobileCloudScale: number; zones: ZoneDef[]; scrollVh: 4 }
```
Units are km in scene space, the same as `gmc_relief_test.blend`. Seed values come from the Blender cameras:
- F1 pos (0,−70,16.8), target (0,40,14.6), fov 65
- F2 pos (−4,−70,30), target (−4,−12,0), fov 62
- map view pos (−6,−98,125), target (−6,−4,0), fov 52
- t = 0, 0.45, 0.8, 1
- "Gelephu core" view pos (8,−46,14.5), target (9.3,4,7.2), with `image: 'assets/project_spire.webp'`

- [ ] **Step 1: Failing test.** `tests/config.test.ts`: the timeline `t` values are strictly increasing and start at 0 and end at 1; every `limits` range has min < max; zone ids are unique and ≥ 1; exactly one zone has an `image`.
- [ ] **Step 2:** `npx vitest run` → FAIL (no config).
- [ ] **Step 3:** Scaffold with `npm create vite@5 gelephu-story -- --template vanilla-ts`. Add `three@0.170.0`, `@types/three@0.170.0`, `gsap@3.12.5`, `vitest`. Write `config.ts` with the values above. `main.ts` mounts an empty canvas.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Both should pass.
- [ ] **Step 5:** Commit: `git add gelephu-story && git commit -m "gelephu-story: scaffold and config"`

### Task 2: Asset pipeline

**Files:** Create `tools/export_assets.py`, `tools/build_maps.py`, `tools/test_assets.py`; output in `public/assets/`.

**Interfaces — Produces (files):**
- `terrain_desktop.glb` (≤ 260k tris) and `terrain_mobile.glb` (≤ 85k tris): a grid mesh with UV0 spanning the full 244 × 166 km extent, meshopt-compressed.
- `terrain_color.webp`: 4096² desktop / 2048² mobile.
- `terrain_normal.webp`: same sizes.
- `zones_id.png`: 2048 × 1394, lossless. Zone k is encoded as RGB (k, 0, 0) and background as 0.
- `zones.json`: `[{id, areaKm2, centroidKm:[x,y]}]`.
- `cloud_{a..e}_{side,top}.webp`: cropped to the alpha bounding box plus 8 px, max 1024 wide.
- `project_spire.webp`: 1942 wide.

How each is made:
- **Meshes:** in `export_assets.py`, subsample the `terrain2.npz` grid (heights shaped per Global Constraints) by stride 3 for desktop and 5 for mobile. Build the mesh in Blender and export glTF with meshopt compression.
- **Baked colour:** render the `GMC_Relief` scene's terrain with an orthographic top-down camera covering the exact extent, using `F4 = 0`, frame 3 sun and world, and Cycles at 64 samples. Diffuse lighting is view-independent, so a top-down render serves as the bake.
- **Normal map:** in `build_maps.py`, from shaped heights with central differences, at the same height scale.
- **Zone IDs:** from `red` in `terrain2.npz`. Take 4-connected components, merge components under 0.5 km² into their nearest neighbour within 1.5 km (otherwise drop them), then number the zones by descending area. The component containing scene point (9.18, −7.77) must receive the id that config gives "Gelephu core". Write that id back into `zones.json` as `"core": true`.

- [ ] **Step 1: Failing test.** `tools/test_assets.py` (plain asserts, run with `python3`):
  - all files exist
  - each GLB is under its triangle cap (parse the accessor counts)
  - textures are at the stated sizes
  - zone ids in the PNG equal the ids in `zones.json`
  - exactly one `core: true`, whose centroid is within 3 km of (9.18, −7.77)
  - the desktop total is under 9 MB and the mobile total under 5 MB
- [ ] **Step 2:** Run `python3 tools/test_assets.py`. It should fail.
- [ ] **Step 3:** Implement both scripts. Run them with `/Applications/Blender.app/Contents/MacOS/Blender -b relief-test/gmc_relief_test.blend -P gelephu-story/tools/export_assets.py` and `python3 gelephu-story/tools/build_maps.py`.
- [ ] **Step 4:** Run `python3 tools/test_assets.py`. It should pass. Then update the `zones` names in `config.ts` to match the generated ids ("Gelephu core" for the core one, "Zone N" for the rest), and re-run `npx vitest run`.
- [ ] **Step 5:** Commit the tools and `public/assets`.

### Task 3: Pure math modules

**Files:** `src/math/{timeline,orbit,zones}.ts`, `tests/math/*.test.ts`

**Interfaces — Produces:**
```ts
sampleTimeline(keys: CamKey[], t: number): { pos: Vector3Tuple; target: Vector3Tuple; fov: number }   // smoothstep ease between keys, t clamped to [0,1]
clampOrbit(sph: {azimuth:number; polar:number; distance:number}, l: Limits): same shape
springTowards(cur: number, goal: number, dtMs: number, halfLifeMs: number): number
decodeZoneId(r: number, g: number, b: number): number      // returns r if g===0&&b===0 else 0
```
- [ ] **Step 1: Failing tests:**
  - `sampleTimeline` at t = 0 / 1 / a key's t returns that key exactly; at t = −1 it returns key 0; at a midpoint it lies strictly between the neighbours.
  - `clampOrbit` clamps each axis independently and leaves in-range values unchanged.
  - `springTowards` halves the gap after `halfLifeMs`.
  - `decodeZoneId(3,0,0) === 3`, `decodeZoneId(3,1,0) === 0`.
- [ ] **Step 2:** Run `npx vitest run tests/math`. It should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests again. They should pass.
- [ ] **Step 5:** Commit.

### Task 4: Stage, terrain and sky

**Files:** `src/scene/{stage,terrain,sky}.ts`, `tests/scene/terrain.test.ts`

**Interfaces:**
- Consumes `CONFIG` and the Task 2 assets.
- Produces:
  - `createStage(canvas): Stage { renderer, scene, camera, tier: 'desktop'|'mobile', onResize(cb) }`. The tier is mobile when `matchMedia('(pointer:coarse)')` matches or the screen width is under 820.
  - `loadTerrain(stage, onProgress): Promise<Terrain { mesh; uniforms: { uHover:{value:number}; uSelected:{value:number}; uFocus:{value:number}; uFocusCenter:{value:Vector2} }; zoneImage: ImageData }>`

**Terrain shader:**
- Base colour comes from `terrain_color` times a light term from `terrain_normal`, using the same sun direction as the bake (a subtle 0.15 weight, for crispness only).
- The zone factor is sampled from `zones_id` with nearest filtering and a 1-texel smoothstep on the edge.
- Colouring: maroon when `uSelected == 0` (all zones on), or when the id equals `uSelected`. Otherwise the zone mixes 78% toward plaster while `uFocus > 0`.
- Hover lightens the hovered zone by 12%.
- Focus fog is `mix(col, mist, uFocus·smoothstep(7, 32, distance(worldXY, uFocusCenter))·0.72)`.

**Sky:** a back-side sphere with a gradient (horizon `#ECEEF2` → zenith `#7FA3D6`), plus a 5000 km mist plane at z = 0.37 in `CONFIG.colors.mist`.

- [ ] **Step 1: Failing test:** with the shader material built in node (no WebGL), `uniforms` contains the four keys, and `loadTerrain` picks the mobile GLB when the tier is mobile (mock the loader and assert the URL).
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Then visual check: `npm run dev`, open it in the browser pane, set the camera to the map key, and screenshot. It should match `relief-test/test_frame_03_v4.png` in layout: GMC centred, maroon zones, surroundings fading, no visible mesh edge.
- [ ] **Step 5:** Commit.

### Task 5: Cloud cards

**Files:** `src/scene/clouds.ts`, `tests/scene/clouds.test.ts`

**Interfaces — Produces:**
```ts
createClouds(stage, seed=7): Clouds { sets: { deck: CloudSet; breakup: CloudSet; veil: CloudSet }; update(dtMs:number, camera): void }
interface CloudSet { group: Group; setOpacity(v:number): void; count: number }
```
- Use one `InstancedMesh` per texture per set.
- **The deck** uses side textures as camera-facing yaw billboards. Place them by the same rule as the Blender `Cards_F1` layout: distance `8+r^1.9·520`, angle ±62°, width `(10..20)·(0.45+d/220)`, z `11.3..12.2 + 0.06W`, around the F1 camera. Add the mist floor plane at z = 11.9 (colour `#B3BAC7`), which fades with the deck opacity.
- **The break-up set** uses top textures lying flat: 150 cards over x −110..100, y −65..90, z 11.5–15.5, width 14–34. Add 10 foreground cards near the F2 camera.
- **The veil set** uses side textures along the base of the project image (filled in by Task 7 with `veil.place(positions)`).
- Counts are multiplied by `CONFIG.mobileCloudScale` (0.5) on mobile.

**Shader (quadplex technique):**
- UV drift from a tiling noise texture: `(noise.rg−0.5)·0.006 + (noise2.rg−0.5)·0.012` at 0.03 speed.
- Alpha erosion `alpha *= 1 − (n−0.5)·smoothstep(1, 0.45, alpha)·4`.
- Camera fade: `smoothstep(near0, near1, viewZ)` with near0/near1 of 2/8 km.
- Generate the noise texture at runtime as a 256² RG value-noise `DataTexture`; there's no asset for it.

- [ ] **Step 1: Failing test:** the instance counts per set equal the config counts (×0.5 on mobile), the same seed gives the same first instance matrix, and `setOpacity(0)` sets the uniform to 0.
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Then visual check at the F1 and F2 keys against `relief-test/test_frame_01_clouds_v2.png` and `test_frame_02_descent.png`: no hard card edges, no camera clipping when moving between the keys.
- [ ] **Step 5:** Commit.

### Task 6: Scroll story

**Files:** `src/story/{scroll,overlays}.ts`, `tests/story/scroll.test.ts`

**Interfaces:**
- Consumes `sampleTimeline`, `Clouds`, `Selection.deselect()` (Task 7; stub it until Task 7 lands).
- Produces:
  - `createScroll(opts:{ trackEl: HTMLElement; onT(t:number):void; onEnd():void; onLeaveEnd():void }): { t(): number; scrollToStart(): void; destroy(): void }`
  - `opacityCurves(t): { deck:number; breakup:number; caption: 0|1|2|3 }`

**Curves:**
- deck: 1 until t = 0.25, then 0 by t = 0.5.
- breakup: in from 0.3 to 0.45, out from 0.7 to 0.85.
- captions:
  - title for 0–0.15
  - "Descending into Gelephu" for 0.3–0.5
  - "Gelephu Mindfulness City" for 0.8 and after

The track is `CONFIG.scrollVh·100vh`. Reaching t = 1 calls `onEnd`, which pins the page (`overflow:hidden` on the body) and enables map interaction. A "Back to top" button calls `scrollToStart()`, which deselects, unpins and smooth-scrolls to 0.

**Review Focus 1 and 4:**
- Resize recomputes t from the scroll position, never resets it.
- If a zone is selected when the user scrolls up (a wheel delta below 0 at the map key with the page pinned), deselect first. A second upward gesture unpins.

- [ ] **Step 1: Failing tests:**
  - `opacityCurves` values at t = 0, 0.4, 0.9.
  - With a jsdom scroll mock: scrolling to the bottom calls `onEnd` once.
  - A simulated resize keeps `t()` within ±0.01.
  - An upward wheel while selected calls `deselect` and does not unpin; the next upward wheel unpins.
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement with GSAP ScrollTrigger (`scrub: true`) on the track. `overlays.ts` renders captions as DOM with CSS opacity.
- [ ] **Step 4:** Run the tests. Then manual check in the browser pane: scroll the full track and confirm the camera goes F1 → F2 → map smoothly, captions fade, and back-to-top replays it.
- [ ] **Step 5:** Commit.

### Task 7: Map interaction, selection and vision

**Files:** `src/interact/{controls,picking,selection}.ts`, `src/scene/vision.ts`, `src/ui/panel.ts`, `tests/interact/*.test.ts`

**Interfaces:**
- Consumes the Task 3 math, `Terrain.uniforms`, `Terrain.zoneImage`, `Clouds.sets.veil`, `CONFIG.zones`.
- Produces:
  - `createControls(stage, limits): { enabled: boolean; update(dtMs): void }`. Pointer drag sets azimuth and polar; wheel or pinch sets distance. All go through `clampOrbit`. Spring-back uses `springTowards` when `springBackMs` is set.
  - `pickZone(ndc: Vector2, stage, terrain): number`. Raycast the terrain mesh, take UV, read `zoneImage` at the nearest texel, and pass it to `decodeZoneId`.
  - `createSelection(deps): { select(id:number): void; deselect(): void; current(): number; busy(): boolean }`
  - `createVision(stage, url): { mesh; setOpacity(v): void }`. The plane is 150 km wide at (−12, 125, 15.5), facing the map camera. Its shader uses edge smoothsteps of L 0→0.16, R 1→0.66, B 0.02→0.30, T 1→0.80; haze mixes toward `#CCD6E5` by `mix(0.18, 0, uv.y/0.8)`; alpha is mask × opacity.

**Selection state machine:**
- `select(id)` tweens the camera to `zone.view` (1.6 s, `power2.inOut`), `uFocus` 0→1, `uSelected = id`, `uFocusCenter` = that zone's centroid, and the vision opacity 0→1 if the zone has an image. It places the veil cards and opens the panel (name + copy + close).
- `deselect()` reverses all of it back to the map key.
- **Review Focus 3:** calling `select(b)` while a transition to `a` is running kills the running tweens, starts from the current values, and leaves `current() === b`.
- Esc calls `deselect()`. Tab cycles zones in id order and Enter selects (the panel and buttons are real `<button>` elements).
- Hover (pointer devices only) sets `uHover` and shows a small name label that follows the pointer. The label hides when the pointer leaves the canvas and never appears on touch devices.

**Review Focus 2:** picking and controls are no-ops until `onEnd` has fired.

**Review Focus 5:** the canvas has `touch-action: none` after pinning; pinch is handled via pointer events, and `preventDefault` stops browser zoom.

- [ ] **Step 1: Failing tests:**
  - `pickZone` against a synthetic 4×4 `zoneImage` returns the expected id for a known UV (mock the raycast hit).
  - Selection: `select(1)` then `select(2)` mid-tween ends with `current()===2`, `uSelected===2`, and only one vision fade active.
  - Controls disabled before `onEnd` ignore pointer input.
  - The pinch handler calls `preventDefault`.
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Then visual check: select "Gelephu core" and compare to `relief-test/test_frame_04_zone_v4.png`. The spire should be at full colour, fading at the edges, with clouds along its base, the map fogged, and only that zone maroon.
- [ ] **Step 5:** Commit.

### Task 8: Loading, tiers, fallbacks and performance pass

**Files:** `src/ui/{loader,fallback}.ts`, `src/main.ts`, `public/fallback.webp`, `tests/ui/fallback.test.ts`

**Interfaces:** Consumes everything; `main.ts` wires the modules in this order: stage → sky + clouds → loader shows → terrain (progress) → scroll → interaction.

**Loader:** a full-screen white panel with a thin progress line driven by the `LoadingManager`. Fade it out once sky and clouds are ready; terrain progress continues behind the title. If the terrain isn't ready by t = 0.3, hold the scroll at 0.3 until it is.

**Reduced motion:** when `prefers-reduced-motion` is set, cloud drift speed is 0, camera tweens last 0.6 s, and scrub smoothing is off.

**No WebGL:** if `WebGLRenderingContext` is missing or context creation fails, show `fallback.webp` (frame 3 v4 at 1600 px) plus a list of zone names and the accuracy note.

Add the footer accuracy note (the text from Global Constraints).

- [ ] **Step 1: Failing test:** when the WebGL context creation mock returns null, `fallback.ts` renders an `<img>` and one `<li>` per `CONFIG.zones` entry. Reduced motion sets the cloud speed uniform to 0.
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Verify:
  - `npx vitest run` passes.
  - `npm run build` passes, and `du -sh dist` is under 12 MB.
  - In the browser pane at desktop size and with `resize_window` mobile preset: scroll the full story, rotate to each limit, and select and deselect the core zone.
  - The console shows no errors.
  - `renderer.info.render.calls` is under 40, read via `javascript_tool`.
  - Screenshot each beat for the hand-over.
- [ ] **Step 5:** Commit.
