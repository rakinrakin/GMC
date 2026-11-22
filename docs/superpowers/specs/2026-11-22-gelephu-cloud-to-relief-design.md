# Gelephu — clouds to white relief: web build design

Date: 2026-11-22 · Status: draft for approval

## Intent

A scroll-driven story page for Gelephu Mindfulness City (GMC). The viewer starts above a sea of clouds, descends through them, and arrives at a white "plaster" relief model of the real GMC terrain. The project zones are the only colour (Bhutanese maroon). Clicking a zone eases the camera in, fogs the rest of the map, and raises that project's image as a vision in the sky behind the hills, veiled by clouds.

The feel is calm, white and premium: the clouds and the plaster terrain share one material language, so cloud and land blend rather than cut.

Approved storyboard renders: `relief-test/storyboard_render_v2.jpg` and `relief-test/test_frame_04_zone_v4.png`.

## Goals

- The four beats play in order from scroll alone: (1) above the clouds, (2) descent with terrain showing through gaps, (3) the full relief map, (4) a zone selected with its project vision.
- One continuous camera; no video and no cuts between beats.
- The map can be rotated and zoomed only within limits the author sets in one config file, including the start view, the angle range, the distance range, and whether it springs back.
- The zones are clickable and hoverable; one zone (the largest zone east of the Mau river, working name "Gelephu core") carries the spire project image.
- It works on current desktop browsers and mid-range phones (iPhone 12-class and newer, recent Android).
- The look matches the storyboard: real terrain, soft misty surroundings, no slab or cut edges.

## Non-goals (for this build)

- Real masterplan or GIS data. Zones come from the reference map image; the boundary comes from the alignment fitted to the OSM Bhutan border (median error about 300 m).
- A CMS, multiple languages, audio, analytics.
- Final copy. Text is placeholder.
- Images for every zone. Only one real project image exists; other zones show a name only.

## Anti-goals (failure even if it "works")

- The region reads as a cake slice or slab with hard edges.
- Clouds look like obvious repeated stickers or cotton balls in the hero moments.
- Initial download over about 15 MB, or a visible stutter while scrolling on a mid-range phone.
- It looks like a generic web map (Mapbox-style tiles, labels everywhere).

## Approaches considered

- **A. Everything live in three.js — chosen.** Terrain as one compressed GLB with baked plaster lighting and AO, clouds as layered transparent cards (the quadplex technique, using our own Blender cloud renders), and a single scroll-driven camera. One consistent experience, easy to tune, light enough for phones. Lighting is simpler than in Cycles; the bake covers most of the gap.
- B. Pre-rendered image-sequence descent plus live 3D map: exact render quality for the descent, but a heavy download (30–80 MB), a hard handover to live 3D, and every change means re-rendering. Rejected.
- C. Mapbox/Cesium: strong at geography, but fights the plaster-and-cloud look. Rejected.

## Decided (by the author during brainstorming)

- Story order and beats as above; maroon for zones; a white plaster relief; the surroundings visible and fading into mist (the "show more surroundings" look, storyboard frame 3 v4).
- Cloud images rendered in Blender and placed as cards, not volumetric clouds.
- The project image uses the "dissolving into the sky" treatment, near full colour, edges fading, clouds along its base (frame 4 v4).
- The author fixes the viewpoint, the interaction and the zoom limits.

## Design

### Stack (builder's call, stated here)
- Vite + TypeScript + three.js (pinned version), GSAP ScrollTrigger for scroll-to-timeline mapping. No framework.
- The output is a static site (deployable to Netlify or any static host).
- New folder `gelephu-story/` at the repo root. Existing folders are untouched.

### Asset pipeline (Blender → web)
A script in `gelephu-story/tools/` (run with Blender headless) produces:
- `terrain.glb`: the relief mesh decimated to about 250k triangles (desktop) plus a roughly 80k version (mobile), with meshopt compression. The source is the existing 244 × 166 km grid in `relief-test/terrain2.npz`, using the same height and surroundings shaping as frame 3 v4.
- `terrain_color.ktx2` (or WebP fallback), 4096²: baked plaster lighting and AO for the fixed sun, with the surrounding mist baked in.
- `terrain_normal.webp` 4096²: fine ridge detail, so the low mesh still reads crisp when zoomed.
- `zones_id.png`: a per-zone ID map (each zone a unique colour) in terrain UV space, used for picking and highlighting. It is traced from the reference image and cleaned (specks under about 0.5 km² removed or merged).
- Cloud cards: the existing 10 PNGs from `relief-test/clouds/`, cropped to content and converted to WebP. Some extra variants are rendered if repetition shows.
- `project_spire.webp`, from the author's render.

### Scene
- **Terrain material:** a custom shader using the baked colour, normal and AO. It also takes the zone ID map, with uniforms for hover, selected zone, the maroon colour, and focus fog (distance from the selected zone mixes toward the mist colour). Non-selected zones mute when a zone is active.
- **Background:** a sky gradient (pale blue zenith → white horizon) plus a large mist ground plane matching the far terrain colour, so there's no visible terrain edge.
- **Clouds:** an instanced card system with three sets.
  1. The deck: side-view cards facing the camera, for beat 1.
  2. The break-up layer: top-view cards lying flat with gaps, for beat 2.
  3. The vision veil: clouds along the base of the project image, for beat 4.

  The shader uses the quadplex approach: noise-driven UV drift for living edges, alpha erosion on thin parts, and fade by camera distance (in near, out far) so cards never visibly clip the camera. Opacity per set is driven by the timeline.
- **Project vision:** a large plane behind the hills, with a shader that fades the edges (left, right, top, bottom), adds slight haze toward the bottom, and has a global opacity driven by selection.

### Camera and interaction
- Scroll timeline (0 → 1) through keyframed camera positions, targets and FOV:
  - 0.00: above the deck (frame 1)
  - 0.45: descent (frame 2)
  - 0.75–1.00: the map overview (frame 3)
- Deck opacity and the break-up layer cross-fade along the way. Text overlays fade at set points.
- After the timeline ends, the map is interactive: drag to rotate (orbit around a fixed target) and pinch or scroll to zoom, clamped by config (azimuth range, polar range, distance range). Optional spring-back to the start view after idle.
- Hover over a zone: a light highlight plus a name label. Click: the camera eases to that zone's preset view (frame 4), focus fog comes on, the vision fades in, and a small text panel shows name and placeholder copy. A close button or Esc reverses it.
- `config.ts` holds every tunable value: camera keyframes, limits, colours, fog distances, cloud counts per device tier, and zone definitions (id, name, view, image path, copy).

### Performance budget
- Initial download under 12 MB on desktop, under 7 MB on mobile (the mobile tier gets smaller textures and the 80k mesh).
- Fewer than about 40 draw calls (the clouds are instanced per texture).
- 60 fps on desktop and at least 45 fps on a mid-range phone during the scroll. Pixel ratio is capped at 2 (1.5 on mobile).
- A loading screen with real progress; the first beat appears as soon as clouds and sky are ready (the terrain can finish loading while the user reads the title).

### Accessibility and fallbacks
- `prefers-reduced-motion`: shorter camera moves, no cloud drift.
- No WebGL: a static fallback image of frame 3 with a zone list.
- Zones reachable by keyboard (Tab cycles zones, Enter selects).

## Accuracy statement (to show alongside the work)
- Terrain: open elevation data at about 30 m, resampled to about 137 m in the mesh plus normal-map detail; height exaggerated 2.6×.
- GMC outline and zones: traced from the reference map image and aligned to the Bhutan–India border (median error about 300 m). They are not survey-accurate, and will be replaced when GIS files are available.

## Left to the builder
- Exact keyframe values and easing (tuned against the storyboard).
- Cloud placement density and seeds per beat.
- Whether to use KTX2 or WebP for textures, depending on what loads fastest in testing.
- Label typography and panel styling, kept minimal and consistent with the white look.

## Calls made by Claude (check these)
- Scroll length is about 4 screen-heights for beats 1→3; then the page pins and the map becomes interactive.
- Title text in beat 1 ("Gelephu Mindfulness City") and short captions at each beat use placeholder copy and a neutral serif plus sans pairing.
- Zone names: only "Gelephu core" is named; the other zones are labelled "Zone 2", "Zone 3", … until real names are given.
- Phones get the same story with lighter assets, not a separate layout.
- The selected zone for the spire image is the largest maroon area east of the Mau river (scene coords about 9.2, −7.8 km).

## Answered by the author
- **Standalone full-screen page.** The whole page is the experience: a full-viewport WebGL canvas fixed behind a tall scroll track (about 4 screen-heights for beats 1→3). When the track ends, page scroll stops and the map becomes the interaction surface (wheel and pinch go to zoom, drag goes to rotate). A small "back to top" control replays the descent.
