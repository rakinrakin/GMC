# GMC Immersive Map: Shared 3D Design System

**Project:** Gelephu Mindfulness City (GMC), map section of the website
**Version:** 1.0 (Phase 1, design foundation)
**Applies to:** every map, object and environment model, whoever builds it
**Use with:** the `ui-3d-element` skill (quality bar and build workflow) + this file (look, scale, conventions) + `references/`

> **The one rule:** if two models are placed side by side and you can tell that different people made them, one of them is wrong. When in doubt, follow the numbers in this document, not your eye.

---

## 0. How to use this document

1. Read §1 (theme) and §2 (palette) once, completely.
2. Before you model anything, look at the matching category section (§5 map, §6 objects, §7 environment).
3. Build with the shared materials (§3) and the shared lighting rig (§4) by **importing `shared/gmc-kit.js`**. Never copy its values into a model and never invent a new material or light setup. If you need one, add it to this file and the kit first, then tell the other designer. See `shared/README.md`.
4. Export with the conventions in §9 and run the review checklist in §11 before you call a model done.

Where this file and the `ui-3d-element` skill disagree, **this file wins on look** (colour, mood, typography, background) and **the skill wins on quality** (geometry smoothness, PBR, texture technique, verification). §10 lists every override.

Status markers used below:
- **[FACT]** confirmed from BIG / press sources.
- **[DERIVED]** our design decision, adapted from the references.
- **[TBD]** must be decided together before the related model starts.

---

## 1. Visual foundation

### 1.1 Theme: "Valley at Lamp-light"

GMC is a city in a river valley at the foot of the Himalaya, built from timber, stone and bamboo and bridged by inhabited bridges. Our map treats the whole valley as **a precious object you are holding**: a carved slab of land floating in a quiet, dark dusk, with warm butter-lamp light glowing from the buildings and the cool blue of mountain water threading through it.

| Principle | Means in practice |
|---|---|
| **Sacred, quiet, warm** (Yoeja) | Dark umber/night surroundings. Warm light sources. Lots of breathing space. No neon, no sci-fi HUD glow, no pure black. |
| **The land is the hero** (BIG + Arena) | The terrain slab, rivers and paddies carry the composition. Buildings sit in the landscape and never dominate it. |
| **Two levels of fidelity** (Masar) | Landmarks get full materials and detail. Background city fabric is soft "clay" massing. The eye goes where the detail is. |
| **Diorama, not satellite** (Arena + BIG axos) | Stylised-real: real proportions and real geography, simplified surfaces, visible cut edges, gentle exaggeration. Not photogrammetry and not cartoon. |
| **Layered and separable** (Masar + BIG axos) | Every model is built in named layers that can be shown, hidden or highlighted alone (terrain, water, paddies, roads, bridges...). |

### 1.2 Mood presets

There are exactly **two lighting moods**. Every model must look correct in both before it is approved.

| Mood | Role | Feel | Reference |
|---|---|---|---|
| **DUSK** (default, hero) | Landing view, marketing shots, floating objects | Alpenglow on the peaks, valley in blue shadow, windows and lamps glowing honey-gold | `references/yoeja/01-hero-alpenglow.jpg`, `references/big/render-airport-dusk.jpg` |
| **DAY** (secondary) | Exploration and reading the plan | Soft high-overcast daylight, gentle mist, true material colours | `references/masar/02-overview-day-clay-context.jpg`, `references/big/render-valley-aerial.png` |

There is no "night" mood. Dusk already covers it, and a darker mood would lose the land.

### 1.3 Rendering aesthetic in one paragraph

Stylised-real PBR, ACES tone-mapped, soft shadows, subtle bloom only on emissive lamps and windows. Surfaces have quiet procedural texture (wood grain, lime-wash variation, stone joints). They are never flat colour and never noisy. Edges are softly bevelled so they catch a thin highlight. The terrain is a thick slab with a cut, stratified earth edge. Everything sits in a dark gradient "void" with low mist, never on a white page and never on a dot grid.

---

## 2. Colour palette

### 2.1 Core tokens (exact values taken from Yoeja's CSS) [FACT]

| Token | Hex | Role in GMC |
|---|---|---|
| `night` | `#0B0E18` | Top of the void / sky gradient |
| `umber` | `#18130F` | Base dark: bottom of the void, UI ink, deepest shadow tint |
| `umber-earth` | `#221208` | Terrain skirt, middle strata |
| `umber-deep` | `#180C05` | Terrain skirt, bottom strata |
| `maroon` | `#6D0033` | *Kemar* band (sacred red band under eaves), primary brand accent |
| `saffron` | `#FE6417` | Active/selected highlight, map anchors (use sparingly, max ~2% of the frame) |
| `marigold` | `#FFB978` | DUSK key light colour |
| `honey` | `#FFC450` | Window and lamp emissive |
| `glow-cream` | `#FFF3DC` | DAY key light colour, specular highlights |
| `sand` | `#EFECE6` | Lime-washed walls, clay massing |
| `stone` | `#7A736A` | Stone masonry, gravel shadow |
| `forest` | `#2F4A38` | Deep forest canopy |
| `sky` | `#0081C4` | Water accent line in DUSK |
| `sky-light` | `#7CC8F2` | Cool rim light, water specular tint |

Yoeja also uses a warm "glow" ramp for flames and halos: `#FFF8EC → #FFF3DC → #FFD28C → #FFC450 → #FFAA3C → #FE7828`. Use **only this ramp** for any emissive gradient (lamp halos, window glow falloff).

### 2.2 Material colours [DERIVED: sampled from BIG renders, harmonised to the core tokens]

| Token | Hex | Used for |
|---|---|---|
| `timber-cedar` | `#8A5A3C` | Main structural timber (light parts of the grain) |
| `timber-dark` | `#5E4130` | Timber grain dark, weathered timber, roof undersides |
| `bamboo` | `#C9A46A` | Bamboo, light timber slats (healthcare-centre fins) |
| `slate-roof` | `#3A3B40` | Dark roofs (Vajrayana centre, shingles) |
| `canopy-mid` | `#3E5A3A` | Forest canopy, mid tone |
| `canopy-light` | `#6E8A4C` | Sunlit canopy, bamboo leaves |
| `paddy-young` | `#A9B865` | Young rice / green paddy terraces |
| `paddy-gold` | `#C8B46A` | Ripe paddy (seasonal variant) |
| `paddy-water` | `#5E7F86` | Flooded paddy tint (reflective) |
| `river-water` | `#2C5560` | River and dam reservoir body colour |
| `gravel` | `#B8B0A2` | Braided riverbeds, gravel bars |
| `mist` | `#C9CFD6` | Low cloud and mist sheets (DAY), × 0.35 brightness in DUSK |
| `textile-madder` | `#9C2F3A` | Temple-Dam tile pattern |
| `textile-slate` | `#4A5C7A` | Temple-Dam tile pattern |
| `textile-rose` | `#C98A86` | Temple-Dam tile pattern |
| `textile-charcoal` | `#2B2A31` | Temple-Dam tile pattern |

Prayer flags (*lungta*), in the traditional order: blue `#2E5FA8`, white `#F4F1EA`, red `#B8322A`, green `#3E8E4E`, yellow `#E8B931`.

### 2.3 Colour rules

1. **The 70 / 25 / 5 split** for any full frame: about 70% landscape (greens, water, earth), 25% architecture (sand, timber, slate), 5% accents (maroon, saffron, honey glow, textile).
2. **Never** use pure black (`#000`) or pure white (`#FFF`) on a surface. The darkest surface is `umber`. The brightest is `sand`.
3. Greens are always **warm and muted**: hue 75–110°, saturation ≤ 40%. If a green looks like a satellite image, desaturate it.
4. Saffron means "this is interactive or selected". Do not use it as a building colour.
5. Maroon only appears on architecture as the kemar band or as painted trim. Never on a whole wall.
6. Every albedo colour above is the **mid value**. Procedural textures vary around it by ±6% lightness, never more.

---

## 3. Materials and textures

### 3.1 General rules (from the skill, kept as-is)

- All materials are `MeshPhysicalMaterial` (or `MeshStandardMaterial` for instanced vegetation and context massing, to keep them fast).
- Every **hero** surface has at least one of: albedo texture, normal map, roughness map, clearcoat or sheen. Flat colour is allowed **only** on context "clay" massing and far LODs.
- Procedural textures are generated with the skill's seeded `mulberry` + `fbm` kit. **Shared seed: `1337`** for all GMC textures. Same seed means the same wood grain everywhere.
- Colour maps use `SRGBColorSpace`. Normal and roughness maps are linear. Anisotropy is max on every texture.
- Texture size: 1024² default, 2048² for hero objects, 4096² only for the terrain albedo/AO. Texel density target: **hero objects ≈ 512 px per 10 m**, map ≈ 1 px per 4–8 m.
- **UVs are in metres.** Every kit texture knows its real tile size (e.g. shingles tile every 2.4 m), so the same material has the same scale on every model. `ExtrudeGeometry` and `ShapeGeometry` already produce metre UVs. For Box, RoundedBox, Cylinder, Lathe and Sphere, run `metricUV(geometry, { along })` or `scaleUV()` from the kit. Timber grain runs along U, so pass `along: 'x' | 'y' | 'z'` with the member's long axis.

### 3.2 Shared material library

These names and values are the contract. Name materials in your files exactly like this (prefix `M_`).

| Material | Base | Key parameters | Texture recipe |
|---|---|---|---|
| `M_timber_cedar` | Physical | roughness .62, metalness 0, clearcoat .12, clearcoatRoughness .5 | Skill wood recipe: dark `#5E4130`, light `#A8754E`, rings .06, warp 30, contrast 1.0, pore .08, bump 2.0. Grain runs along the member's long axis. |
| `M_timber_dark` | Physical | roughness .7 | Same recipe, dark `#3B281D`, light `#6A4A36` (roof undersides, brackets in shadow) |
| `M_timber_painted` | Physical | roughness .55, clearcoat .2 | Bands of `maroon`, `saffron` and `sand` with 1 px darker separators, running horizontally on vertical faces (0.6 m repeat). For bracket ends, trim and the kemar band |
| `M_medallion` | Physical | roughness .5, clearcoat .2, alphaTest .35, double-sided | Circular decal (UV 0..1 across a `CircleGeometry`): gold centre, maroon ring, 8-petal saffron lotus, sand and maroon rims. For beam ends (see `references/big/render-bridge-interior-medallions.png`) |
| `M_gold` | Physical | color `#F0C86A`, metalness .65, roughness .3, clearcoat .3 | None. Finials only, used sparingly |
| `M_bamboo_slat` | Physical | roughness .5, sheen .3, sheenColor `#FFD28C` | Base `bamboo`, node rings every 0.4 m, fine fibre normal (scale .3) |
| `M_lime_wall` | Physical | roughness .92 | Base `sand`. Low-frequency fbm albedo ±4% (lime-wash streaks running vertically), normal scale .15 |
| `M_stone_masonry` | Physical | roughness .86 | Base `stone`. Irregular coursed blocks 0.4–0.9 m, mortar 2 cm at `#5C564F`, normal scale .6 |
| `M_slate_roof` | Physical | roughness .55, clearcoat .25 | Base `slate-roof`. Overlapping shingle rows 0.3 m, normal scale .5 |
| `M_glass` | Physical | color `#1D2A30`, roughness .05, metalness 0, envMapIntensity 1.3, ior 1.5 | None. Opaque reflective (no transmission, for performance). In DUSK, interior glow comes from `M_window_glow` cards placed 0.3 m behind the glass. |
| `M_window_glow` | Basic (unlit) | color `honey` × 2.2 (HDR, DUSK) / `#2A241F` unlit interior (DAY). Set by the kit's mood switch | Vertical gradient from the glow ramp, warm at the bottom. The ×2.2 puts it above the bloom threshold. |
| `M_textile_tile` | Physical | roughness .45, clearcoat .35 | Diamond grid of the 4 `textile-*` colours, weighted madder 35 / slate 30 / rose 20 / charcoal 15, slight per-tile bevel normal. Temple-Dam face only. |
| `M_clay` | Standard | color `sand`, roughness .85 | None. Context massing only. |
| `M_clay_roof` | Standard | color `#D9D3C8`, roughness .8 | None. Roofs of context massing (a touch darker than walls so roofs read) |
| `M_terrain` | Standard | roughness .95 | Baked albedo (vegetation classes) × baked AO, plus macro normal from the DEM. See §5.3. |
| `M_skirt` | Standard | roughness 1 | Horizontal strata: top 8% `#4A3A2C` (soil), then `umber-earth` with fbm streaks, fading to `umber-deep` at the bottom. Slight vertical normal noise. |
| `M_water` | Physical | color `river-water`, roughness .08, metalness 0, clearcoat 1, clearcoatRoughness .05, envMapIntensity 1.0 | Ripple normal: 2-octave fbm, repeat 40, normalScale .25. Banks fade to `gravel` over a 2–6 m strip. |
| `M_gravel` | Standard | color `gravel`, roughness .95 | Pebble fbm normal, darker wet edge (`stone`) where it meets water |
| `M_paddy` | Standard | color `paddy-young`, roughness .8 | Row stripes 0.25 m along the contour plus a thin bund (embankment) line `#8C8A5A`. Variant `M_paddy_flooded`: `paddy-water`, roughness .15 |
| `M_canopy` | Standard | color `canopy-mid`, roughness .9 | Per-instance colour jitter ±8% lightness between `forest` and `canopy-light` (`instanceColor`) |
| `M_anchor` | Basic (unlit) | color `saffron`, opacity .9 | Map anchor rings and leader lines only |

**Detail scale rule:** procedural detail sizes above are in **real metres**. Set texture `repeat` from the real size of the surface so a 0.3 m shingle is 0.3 m on every model.

---

## 4. Lighting, shadow and render setup

All models are previewed and reviewed under **this exact rig**. Do not tune lights per model. If a model looks wrong under the rig, fix the model.

### 4.1 Environment map (adapted from the skill's studio recipe)

The skill's `studio()` PMREM room, re-tinted for GMC. Same structure, different colours:

```js
// GMC environment: replaces the skill's neutral studio
function gmcEnvironment(pmrem, mood /* 'dusk' | 'day' */) {
  const s = new THREE.Scene();
  const room = mood === 'dusk' ? 0x161a26 : 0x8a8f96;   // never pure black
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40,40,40),
    new THREE.MeshBasicMaterial({ color: room, side: THREE.BackSide })));
  const panel = (w,h,i,pos,col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0,0,0); s.add(m); };
  if (mood === 'dusk') {
    panel(14,4,4.0, new THREE.Vector3(-12, 3, 4), 0xffb978); // low west sun (marigold)
    panel(16,6,1.2, new THREE.Vector3(  0,14, 0), 0x3a4a6e); // dusk sky dome (cool)
    panel(1.2,14,2.0,new THREE.Vector3( 11, 2,-6), 0x7cc8f2); // cool rim (sky-light)
    panel(16,1,1.0, new THREE.Vector3(  0,-7, 8), 0xffc450); // warm ground bounce (lamps)
  } else {
    panel(18,10,3.0,new THREE.Vector3( -6,12, 6), 0xfff3dc); // overcast key (glow-cream)
    panel(18,10,1.6,new THREE.Vector3(  6,12,-6), 0xdfe6ee); // sky fill
    panel(1.2,14,2.0,new THREE.Vector3( 11, 2,-6), 0xffffff); // rim
    panel(16,1,1.2, new THREE.Vector3(  0,-7, 8), 0xa9b865); // green ground bounce
  }
  return pmrem.fromScene(s, 0.02).texture;
}
```

### 4.2 Lights

Directions use world axes (§8.2): north = −Z, east = +X, up = +Y. *Azimuth* is measured clockwise from north.

| | DUSK | DAY |
|---|---|---|
| Key `DirectionalLight` colour | `marigold #FFB978` | `glow-cream #FFF3DC` |
| Key intensity | 3.0 | 3.2 |
| Key azimuth / elevation | 255° (WSW) / 18° | 215° (SW) / 45° |
| Key direction vector (normalised, from target toward light) | `(-0.919, 0.309, 0.246)` | `(-0.406, 0.707, 0.580)` |
| `HemisphereLight` sky / ground / intensity | `#3A4A6E` / `#221208` / 0.9 | `#DFE6EE` / `#7A736A` / 0.9 |
| Env intensity (× each material's `envMapIntensity`; three r160 has no scene-wide setting) | 0.85 | 1.0 |
| Emissive windows / lamps | on (`honey` × 2.2) | off (unlit interior `#2A241F`) |
| Fog (`FogExp2`) colour / density* | `#1A1D2A` / 0.00004 | `#C9CFD6` / 0.00003 |

\*Fog density is per metre at map scale. Object preview scenes use no fog.

Why WSW at dusk: the low sun rakes across the north–south valleys, so ridges catch alpenglow on their west faces and the river valleys fall into blue shadow, which is the Yoeja hero image applied to our terrain. *Tested in the kit preview:* at 12° elevation, flat ground seen from above went murky olive, so the sun sits at **18°**. That is still low and warm, but the land stays readable.

### 4.3 Shadows

- One shadow caster: the key light. `PCFSoftShadowMap`, map 2048 (objects) / 4096 (map), tight frustum fitted to the model's bounds plus 10%.
- `shadow.bias = -0.0002`, `shadow.normalBias = 0.02`, `shadow.radius = 4`.
- Static models (terrain, context massing) also get **baked AO** (see §5.3). Realtime shadow is for objects and their contact with the ground.
- Floating objects cast onto their own plinth (realtime) and drop a soft **ghost shadow** on the map below: a blurred dark disc, `umber` at 18% opacity, size = 1.2 × footprint.
- Shadows are never pure black. With the hemisphere light above, the darkest shadow should read as about `#1E1A1A` in DUSK.

### 4.4 Renderer and post (three.js `0.160.0`, as the skill specifies)

| Setting | Value |
|---|---|
| `toneMapping` | `ACESFilmicToneMapping` |
| `toneMappingExposure` | DUSK 1.05 · DAY 1.05 |
| `outputColorSpace` | `SRGBColorSpace` |
| Composer | HalfFloat MSAA target (samples 4) → RenderPass → UnrealBloom → OutputPass |
| Bloom (strength / radius / threshold) | DUSK .32 / .5 / .9 · DAY .12 / .4 / .97 |
| GTAO | **Off** (the skill found it causes artifacts with a transparent shadow plane, so we use baked AO plus shadows instead) |
| Background | Canvas gradient (below). Not a dot grid. |

**Background (the "void"):** vertical gradient `night #0B0E18` (top) → `umber #18130F` (bottom), a soft radial lift behind the subject (+6% lightness), and a faint horizontal mist band at 35–45% of screen height (`mist` at 6% opacity). ACES darkens it, so author it about 2× brighter than the target (the skill's rule). In DAY, the gradient is `#DCE1E6 → #B9BEC2`.

---

## 5. Map model specification

### 5.1 What the map is [FACT + DERIVED]

- GMC covers **more than 1,000 km²** around Gelephu in southern Bhutan, on the India border [FACT, Dezeen / Designboom].
- **35 rivers and streams** run north to south from the mountains to the plain [FACT, BIG].
- Density increases **from scattered small buildings in the north to larger urban footprints in the south** [FACT, BIG].
- **Eleven neighbourhoods**, each laid out on mandala principles around a central public space, as ribbon-like terraces between rivers that look like paddy fields [FACT, ArchDaily / Designboom].
- **Three main mobility connections** cross the city east–west. Where they cross rivers they become **inhabitable bridges** [FACT, BIG / Designboom].
- The **Sankosh Temple-Dam** sits on the city's **western border** [FACT, Designboom / ArchDaily].
- The rivers are **braided**: wide pale gravel beds with thin water channels (`references/big/render-valley-aerial.png`) [FACT, visual].

### 5.2 Map extent and form [TBD → decide before M1 starts]

| Option | Extent | Pros / cons |
|---|---|---|
| **A (recommended)** | The full GMC area, including the Sankosh dam on the west edge, plus about 10% foothill margin to the north | Every hero object has a real anchor on the map. Terrain resolution per metre is lower, so the core valley needs a higher-resolution inset. |
| B | The Gelephu core valley only (~25 × 20 km) | Sharper terrain, but the dam and possibly the airport have no anchor on the slab. |

Whichever is chosen:
- **Shape:** a thick slab with a **cut edge (skirt)**. The outline follows the GMC boundary softened with a 400 m radius (not a hard rectangle), as in Arena (`references/arena/01-terrain-slab-overview.jpg`) and the BIG axos.
- **Skirt depth:** 6% of the slab's shorter side, minimum 1,200 m (real units), material `M_skirt`, with a 1 px lighter top-edge line (`#4A3A2C`) to separate the land from the cut.
- **Vertical exaggeration:** **1.5×** on terrain height only (Arena uses 2.6×, which is too theatrical for GMC). Objects are never exaggerated, only placed at the exaggerated ground height.
- **Base plane:** the slab floats over a large disc of `M_water`-like dark surface (`#141820`, roughness .3) 300 m below the skirt bottom, which catches faint reflections. Same idea as Arena's dark sea and Masar's dark ground, in our colours.

### 5.3 Map layers (build each as a separate named node)

The layer stack copies BIG's own explanation sequence (`references/big/axo-1` → `axo-6`), so the map can later tell the same story layer by layer, like Masar's component mode.

| # | Node name | Content | Source data | Look |
|---|---|---|---|---|
| 1 | `L_terrain` | Heightfield mesh + skirt | Copernicus GLO-30 DEM (30 m), cropped to the extent | `M_terrain`: baked albedo (forest `forest`/`canopy-mid`, open land `canopy-light`, bare slope `#8C7A62`, high ridge `#9A9188`), baked AO, macro normal |
| 2 | `L_water_rivers` | River water ribbons (slightly sunk, −1.5 m) | OSM waterways + hand-traced braided beds | `M_water` for channels, `M_gravel` for beds. Major rivers 1:1 width, small streams minimum 30 m wide so they read |
| 3 | `L_eco_corridors` | Wildlife and forest corridors (flat decals, 0.5 m above terrain) | Hand-drawn from `axo-2` | Hidden by default. When shown: `forest` tint with dashed `sand` edge |
| 4 | `L_paddies` | Ribbon terraces between rivers | Hand-drawn from `axo-3` | `M_paddy` / `M_paddy_flooded` in alternating terraces, stepped 0.5–2 m per terrace |
| 5 | `L_neighbourhoods` | 11 neighbourhood ground plates + mandala street pattern | Hand-drawn from `axo-4` | Plaza at centre, radial/orthogonal streets in `#D9D3C8` |
| 6 | `L_context_massing` | Context buildings (instanced boxes with roofs) | Procedural from the neighbourhood plates | `M_clay` + `M_clay_roof`. 2–6 storeys × 3.5 m. Smaller and sparser to the north |
| 7 | `L_mobility` | 3 main east–west corridors, local roads, mountain trail | `axo-5` + OSM roads | Corridors 40 m wide `#C9C2B4`. Roads 12 m `#BDB6A8`. Trail as a dotted line decal |
| 8 | `L_bridges` | Map-scale tokens of every bridge and landmark | From the object models (LOD2) | Real footprint, simplified massing, real materials (no clay) |
| 9 | `L_anchors` | One anchor ring per hero object | Object metadata (§9.4) | `M_anchor` ring, inner Ø 120 m, 12 m thick, 2 m above terrain |
| 10 | `L_boundary` | GMC boundary line | Official boundary [TBD source] | 20 m line in `sand`, 70% opacity |
| 11 | `L_mist` | 2–3 low mist sheets in the valleys | Environment model E5 | See §7 |

### 5.4 Map production pipeline (recommended)

The terrain comes from real elevation data, so it is the one model **not** built purely in code:

1. **QGIS:** download Copernicus GLO-30 tiles, merge, reproject to UTM 46N (EPSG:32646), crop to the agreed extent, export a 16-bit heightmap PNG (4097 × N) and the vegetation-class raster.
2. **Blender** (the skill's "escalate to Blender" path): displace a grid from the heightmap at 1.5×, add the skirt, bake **AO** and **albedo** to 4096² textures, decimate to the triangle budget (§8.4), export GLB.
3. **three.js:** load the GLB, apply `M_terrain` with the baked maps, and add layers 2–11 as separate meshes (rivers, paddies and roads can be code-built from traced SVG/GeoJSON shapes, so they stay editable).

*Fallback if Blender is unavailable:* load the 16-bit heightmap straight into a `PlaneGeometry` (512 × 512 segments), displace in JS, and compute AO approximately with a horizon-based bake in a canvas. This looks lower quality but is consistent.

---

## 6. Object model specification

### 6.1 Hero object list [FACT for function and location, DERIVED for form]

Form notes come from BIG's renders in `references/big/`. Where BIG has published no image, the object uses the **bridge typology O0** until real imagery is found.

| ID | Object | What we know | Form to model |
|---|---|---|---|
| **O0** | *Inhabited bridge typology* (template) | Bridges are "cultural landmarks that double as transport infrastructure", compared to dzongs | Two-level timber bridge. Lower deck on paired timber columns on stone piers. Glazed hall above. **Deep stacked timber bracket roof** (layered cantilevered beams, like traditional Bhutanese bracketing). Painted circular **medallions on beam ends**. See `render-bridge-elevation.jpg` and `render-bridge-interior-medallions.png` |
| **O1** | International airport | Timber terminal acting as a bridge; runway raised across several rivers; at the foot of the valley | **A long row of ~20 diamond (rhombus) gabled timber roof modules**, glowing honey from below at dusk. Low and horizontal against the mountains. See `render-airport-dusk.jpg` |
| **O2** | Sankosh Temple-Dam | Western border; "stepped" (step-well) dam face; visitor centre; temple nested in the cliff; called "a 21st century Tiger's Nest" | **Triangular dam face filling a V-shaped forested gorge**, clad in the **diamond textile-tile pattern** (`M_textile_tile`), with stepped terraces and stairs. A warm-lit **temple niche** cut into the upper centre. Reservoir behind it. See `render-temple-dam-aerial.png` and `render-temple-dam-tiles.jpg` |
| **O3** | Vajrayana spiritual centre | On a bridge that "crisscrosses a river" | **Stacked pavilions with dark hip roofs** (`M_slate_roof`) on a bridge spine crossing a forested river gorge, terraced paddies on the banks. See `render-vajrayana-centre.png` |
| **O4** | Healthcare centre | Blends Eastern and Western medicine | **Curved saddle-shaped building clad in vertical bamboo/timber slats** (`M_bamboo_slat`), rising at both ends. See `render-healthcare-centre.png` |
| **O5** | University (bridge) | On a bridge; "showcasing academic activities" | O0 typology. Form [TBD from BIG imagery] |
| **O6** | Market (bridge) | Textiles and Bhutanese heritage | O0 typology, open ground level, textile awnings in `textile-*` colours. Form [TBD] |
| **O7** | Cultural centre | Bhutanese culture and customs | O0 typology. Form [TBD] |
| **O8** | Agricultural exhibit | Hydroponic / aquaponic greenhouse | O0 typology with a glass greenhouse roof. Form [TBD] |

Neighbourhood architecture (context and close-up streets, `render-street-*.png`): 2–6 storeys, lime-washed (`M_lime_wall`) masonry ground floors, timber upper storeys and balconies (*rabsel* windows), deep eaves, green roof terraces, patterned stone paving. This informs the **context massing proportions** and environment kit E11. It is not a hero object.

### 6.2 Modelling style and level of detail

- Follow the skill's geometry rules: Catmull-Rom silhouettes, generous bevels (≥ 10 segments on hero edges), `RoundedBoxGeometry` for anything the eye lands on, `LatheGeometry` for turned parts, invisible fat hit-meshes for thin parts.
- **Real proportions, from real metres.** Typical numbers: storey 3.5 m, door 2.2 m, railing 1.1 m, timber column 0.35–0.5 m square, bracket layer 0.25 m, eave overhang 1.5–2.5 m, bridge deck span between piers 18–30 m.
- **Detail density:** at the skill's 25% zoom close-up the viewer should see column capitals, bracket layers, window mullions, medallions and railings. Smaller than 5 cm is texture or normal map, not geometry.
- **Bhutanese vocabulary** to use (and not overuse): kemar maroon band under eaves, stacked bracket cornices, rabsel bay windows, whitewashed battered (slightly inward-sloping, ~2°) masonry bases, dark timber frames, gold finials (sparingly: `#F0C86A`, metalness .65, roughness .3, from the skill's gold preset).
- **Do not** add generic Asian or Chinese motifs (upturned dragon eaves, red lacquered columns). When unsure, compare with `references/yoeja/04-photography-chorten.jpg` and the BIG renders.

### 6.3 Object presentation: "floating diorama"

Each hero object exists twice:

1. **In-map token** (LOD2, in `L_bridges`): true position, true scale, sitting on the terrain.
2. **Floating hero** (LOD0/1): the full model, raised above its anchor on a small piece of its own landscape.

The floating hero rules [DERIVED: visual rhyme with the map slab]:

| Element | Spec |
|---|---|
| **Plinth** | A rounded-square slab of local terrain cut from the map around the object. Size = 1.25 × the object's footprint diagonal. Corner radius 12% of the side. Same `M_skirt` strata as the map, skirt depth = 10% of the plinth side. Includes the local river, trees and paddies (environment kit at full detail). |
| **Display scale** | The hero is scaled so its plinth is about 7% of the map's visible width in the overview camera. Record the factor as `heroScale` in metadata. |
| **Float height** | Plinth bottom sits above the anchor terrain at 5% of the map's visible width. |
| **Leader** | A 1 px-equivalent vertical line from the plinth centre down to the anchor ring: `M_anchor`, 60% opacity, fading to 0 at the top 30%. |
| **Ghost shadow** | As in §4.3. |
| **Orientation** | Shown at the object's real yaw, plus `heroYaw` from metadata if a better 3/4 view needs it (max ±45°). |
| **Idle state** | Static in Phase 2. Bobbing and rotation come in Phase 4. |

---

## 7. Environment model specification

Environment models are **kits**: small reusable pieces placed many times (instanced) by both designers. Each kit item has LOD0 (hero plinths, close-ups), LOD1 (map mid-zoom) and LOD2 (map far: billboard or merged).

| ID | Item | Spec |
|---|---|---|
| **E1** | Forest trees (4 species) | Lowland subtropical broadleaf (round, layered crown, 15–25 m), sal-like tall broadleaf (25–30 m, narrow), chir pine (lower slopes, 20–30 m, open crown), blue pine (upper slopes, conical, 15–25 m). Crowns are **clustered low-poly blobs with a leaf normal map**, not individual leaves. `M_canopy` + trunk `M_timber_dark`. Map placement from the vegetation raster, never on a regular grid. |
| **E2** | Bamboo clumps | 8–15 culms per clump, 8–15 m, arching. Leaves `canopy-light` |
| **E3** | Paddy tiles | Terrace pieces (straight, curved, corner) with 0.3–0.6 m bunds. Variants: green / golden / flooded |
| **E4** | Water | `M_water` river ribbons, reservoir surface (O2), paddy water. Shared ripple normal. No animated water in Phase 2 |
| **E5** | Mist and cloud | Large soft planes with fbm alpha (feathered edges), at 60–250 m above valley floors in DAY. In DUSK, `mist` × 0.35 and lit warm on the west side. Never covers a hero object |
| **E6** | Chorten (stupa) | White (`M_lime_wall`) Bhutanese chorten, 4–10 m, stepped base, gold finial. See `references/yoeja/04-photography-chorten.jpg` |
| **E7** | Prayer flags | *Lungta* strings (5 colours, §2.2) between poles, and vertical white *darchor* poles 6–9 m. Cloth as thin planes with a gentle sag curve |
| **E8** | Himalaya backdrop | A ring of far peaks behind the north edge, outside the slab, in silhouette. Snow caps catch `marigold` in DUSK (the Yoeja hero). 3 depth layers, each fading toward `night` |
| **E9** | River gravel and boulders | Scattered pebble decals + instanced boulders (0.5–3 m) on the braided beds |
| **E10** | Rural farmhouse | Traditional 2–3 storey Bhutanese farmhouse: rammed-earth/lime base, timber upper floor, open loft under a pitched roof. For the scattered northern fringe |
| **E11** | Street kit | Patterned paving, low walls, planters, lamps (lamps glow `honey` in DUSK). Used on plinths and close-ups |
| **E12** | Wildlife (optional) | Elephant silhouettes for the eco-corridor layer (the press mentions protected elephant migration routes). Very low-poly, `#5C564F` |

**Rule:** environment must *frame* the objects, never compete. On a plinth, nothing environmental may be taller than 60% of the hero object or brighter than its lit facade.

---

## 8. Scale, orientation, budgets

### 8.1 Units

**1 scene unit = 1 metre, always, in every file.** This is the glTF convention, so nothing needs rescaling at integration. The map root is the only node that gets a display scale (set at integration, never baked into files).

### 8.2 Axes and orientation

- **+Y = up. −Z = north. +X = east.** (Right-handed, glTF / three.js default.)
- Model everything in its **true real-world orientation** (rivers flow toward +Z, which is south).
- The default overview camera looks north, so mountains are at the back and the city is in front. This is the same composition as BIG's axos.

### 8.3 Origins (pivots)

| Category | Origin |
|---|---|
| Map | Centre of the agreed extent at sea level (y = 0 means 0 m elevation). Record the UTM 46N coordinate of the origin in `map.meta.json` |
| Objects | Centre of the footprint, at the **lowest ground contact point**. Bridges are the exception: deck centre projected down to **bank level** (the average height of both abutments), not to the riverbed |
| Environment kit | Base centre of the item (tree: trunk base; flag string: first pole base) |
| Plinths | Centre of the top surface |

### 8.4 Budgets (web realtime)

| Asset | Triangles | Textures | Draw calls |
|---|---|---|---|
| Map terrain + skirt | ≤ 800k (LOD0), 200k (LOD1) | 4096² albedo, 4096² AO, 2048² normal | ≤ 3 |
| All other map layers combined | ≤ 400k | 2048² shared atlas | ≤ 40 |
| Hero object LOD0 (plinth included) | ≤ 150k | ≤ 6 × 2048² | ≤ 25 |
| Hero object LOD1 | ≤ 40k | 1024² | ≤ 10 |
| Hero map token LOD2 | ≤ 5k | shared atlas | 1–2 |
| Context building (instanced) | ≤ 200 | none | 1 per type |
| Tree LOD0 / LOD1 / LOD2 | 1,500 / 300 / 2 (billboard) | 1024² shared | 1 per species per LOD |
| **Whole integrated scene** | **≤ 2.5M visible** | **≤ 160 MB GPU** | **≤ 300** |

LOD switch distances (from the camera, real metres): LOD0 < 600, LOD1 < 3,000, LOD2 beyond.

### 8.5 Camera guidelines

| View | Projection / FOV | Position | Used for |
|---|---|---|---|
| **V1 Map overview** | Perspective, **FOV 30°** (low distortion, near-axonometric like BIG and Masar) | Pitch −45°, yaw 20° west of north (rivers run diagonally across the frame, as in Masar) | Main view, all map reviews |
| **V2 Object hero 3/4** | Perspective, FOV 30° | Elevation 25°, yaw 35° off the main facade, framed to 70% of frame height | Object reviews, floating hero |
| **V3 Plan** | Orthographic, top-down | — | Footprint and alignment checks between designers |
| **V4 Eye level** | Perspective, FOV 40° | 1.7 m above ground, near the object | Proportion check (doors, people, railings) |
| **V5 Detail** | Perspective, FOV 30° | Skill's 25% zoom on the richest detail area | Detail and texture check |

Never use a camera roll. Never use FOV > 45° for presentation (wide-angle distortion breaks the diorama feeling).

---

## 9. Naming and export conventions

### 9.1 Folder structure

```
GMC Map/
├─ design.md                ← this file (single source of truth)
├─ references/              ← screenshots from the 4 references (internal use only)
│  ├─ yoeja/  masar/  arena/  big/
├─ shared/                  ← gmc-kit.js (tokens, materials, rig, stage, validator) + gmc-kit-preview.html + README.md
├─ tools/                   ← serve.mjs (local preview server)
├─ models/
│  ├─ map/                  ← M*
│  ├─ objects/              ← O*
│  └─ environment/          ← E*
└─ previews/                ← review renders (PNG) per model
```

### 9.2 File names

`gmc_<cat>_<id>-<name>_v<NN>[_lod<N>].<ext>`, all lowercase, hyphens inside the name.

- `cat` = `map` | `obj` | `env`
- Examples: `gmc_obj_o1-airport_v03.glb`, `gmc_obj_o1-airport_v03_lod2.glb`, `gmc_env_e1-tree-blue-pine_v01.glb`, `gmc_map_m1-terrain_v02.glb`
- Source (the skill's HTML artifact or JS module): same name, `.html` / `.js`.
- Preview renders: `gmc_obj_o1-airport_v03_V2-dusk.png` (camera view + mood).

### 9.3 Inside each file

- Root node name = file id without version (`gmc_obj_o1-airport`).
- Layer children start with `L_` (map layers from §5.3; objects use `L_structure`, `L_roof`, `L_glazing`, `L_glow`, `L_plinth`, `L_env`).
- Materials start with `M_` and use **only** names from §3.2. A new material is a change to this file first.
- No lights or cameras inside model files. The rig (§4) lives in `shared/`.
- Emissive window cards go in `L_glow` so DAY mode can switch them off in one call.

### 9.4 Metadata sidecar (`<file>.meta.json`, required)

```json
{
  "id": "gmc_obj_o1-airport",
  "version": 3,
  "category": "object",
  "author": "A",
  "status": "review",
  "anchorUTM46N": [0, 0],
  "anchorMapXZ": [0, 0],
  "footprintM": [1200, 180],
  "heightM": 28,
  "heroScale": null,
  "heroYaw": 0,
  "tris": { "lod0": 0, "lod1": 0, "lod2": 0 },
  "materials": ["M_timber_cedar", "M_glass", "M_window_glow"],
  "sourceRefs": ["references/big/render-airport-dusk.jpg"],
  "notes": ""
}
```

### 9.5 Export

- **Format:** GLB (glTF 2.0 binary), +Y up, metres, `KHR_materials_*` extensions on (clearcoat, sheen, ior). Procedural canvas textures are embedded as PNG.
- Code-built models (from the skill) are exported with three.js `GLTFExporter` (`binary: true`, `onlyVisible: false`) **and** the source module is kept, so the model can be regenerated.
- At integration only (Phase 3): Draco geometry compression + KTX2 textures. **Do not** compress the hand-off files.
- Apply all transforms before export (no scaled or rotated root in the file).

---

## 10. How this file adapts the `ui-3d-element` skill

| Skill default | GMC rule | Why |
|---|---|---|
| Dark `#19191A` background + dot grid | Night→umber gradient void with a mist band (§4.4) | Yoeja's warm-dark mood; the dot grid reads as "tech product" |
| Off-white `#E9E6DF` text, accent `#FF7A45`, live green `#43D17A` | `sand`, `saffron #FE6417`, `maroon #6D0033` | GMC brand alignment with Yoeja |
| JetBrains Mono / Inter UI | Preview shells: **Belleza** (titles), **Alegreya Sans** (UI), keep a mono font only for the `KEY::VALUE` debug chips | Matches the Yoeja type system |
| Neutral studio env | `gmcEnvironment(pmrem, mood)` (§4.1) | One shared dusk/day light for both designers |
| "Variant switcher" | Must include **DAY / DUSK** and **MATERIAL / CLAY** switches | These are the two states every model must pass |
| "One interaction that makes it alive" + sound | **Deferred to Phase 4.** Previews keep orbit, zoom (to cursor), pan, reset and the quality toggle only | The current priority is models, not interaction |
| Bloom .2 / .95 | Per mood (§4.4) | Dusk lamp glow needs slightly more |
| **Kept unchanged** | Geometry quality bar, PBR rules, texture recipes and colour spaces, shadow setup, GTAO warning, quality auto-downgrade, the **browser verification workflow (§4 of the skill)** | This is the shared quality floor |

---

## 11. Review checklist (both designers, every model)

A model is **done** only when the other designer has ticked all of these from the preview artifact.

**Look**
- [ ] Under the shared rig, in both DUSK and DAY, with no per-model light tweaks.
- [ ] Only materials from §3.2. Colours within ±6% of their tokens.
- [ ] No pure black or white surfaces, no saturated "satellite" greens, saffron used only for anchors.
- [ ] Hero surfaces textured (grain, lime-wash, joints). Nothing flat except clay massing.
- [ ] Bevels catch a thin highlight. No faceted curves at V2 and V5.

**Accuracy**
- [ ] Form checked against the listed `sourceRefs`. Anything invented is noted in `notes`.
- [ ] V4 eye-level check: doors, railings and storeys read at human scale.
- [ ] Orientation true (north −Z). Pivot per §8.3.

**Consistency**
- [ ] Placed next to at least one model by the **other** designer in one scene: same light response, same texture scale, same bevel softness.
- [ ] Texel density matches §3.1 (check a wood surface side by side).

**Technical**
- [ ] Triangle and texture budgets met (§8.4). LODs present.
- [ ] Names (file, nodes, layers, materials) follow §9. `meta.json` filled in.
- [ ] GLB opens in a clean three.js scene at the right size and orientation with no console errors.
- [ ] Preview renders saved for V1/V2 (whichever applies), V3, V4, V5 × DUSK/DAY in `previews/`.

---

## 12. Workflow and work split

### 12.1 Phases (from the brief)

1. **Phase 1, Design foundation:** this file + references. ✅
2. **Phase 2, Model creation:** the models in §5–§7. Static only.
3. **Phase 3, Integration:** one scene, Draco/KTX2, LOD tuning, cross-check scale and lighting.
4. **Phase 4, Interaction:** navigation, floating objects, layer stories, day/dusk transitions, labels and UI.

### 12.2 Before Phase 2 starts (decide together)

- [ ] Map extent: option A or B (§5.2).
- [ ] Official GMC boundary source for `L_boundary`.
- [x] The `shared/` kit (materials, environment, rig, background, review stage, validator), so both designers import the same code instead of copying values. **Done: `shared/gmc-kit.js` v1.0.0.**
- [ ] The split below.

### 12.3 Suggested split (balanced by effort, change as you like)

| Designer A (owner: direction + map) | Designer B |
|---|---|
| `shared/` kit upkeep (v1.0.0 done) | E1 trees, E2 bamboo, E3 paddy tiles |
| M1 terrain + skirt, M2 rivers, map layers 3–11 | E4 water, E5 mist, E8 Himalaya backdrop |
| O0 bridge typology (the template others reuse) | O1 airport, O4 healthcare centre |
| O2 Temple-Dam, O3 Vajrayana centre | E6 chorten, E7 prayer flags, E9 gravel, E10 farmhouse, E11 street kit |
| O5–O8 (once BIG imagery is found) | E12 wildlife (optional) |

The first object each designer finishes (A: O0, B: E1) is **reviewed by both** before anything else is built, to lock in the shared look early.

---

## 13. Reference breakdown

### A. Yoeja: visual theme (`references/yoeja/`)

| Take | Adapt for GMC | Avoid |
|---|---|---|
| The exact token set: umber `#18130F`, night `#0B0E18`, maroon, saffron, sand, stone, and the 12-step warm "glow" ramp | Palette §2; void background; emissive gradients | Using maroon or saffron as large fills |
| Dusk alpenglow on Himalayan peaks over a blue valley | The DUSK mood and the E8 backdrop | Photographic skies behind the 3D model |
| A single butter-lamp flame glowing in the dark (scroll sequence) | Honey window glow and lamp emissive; bloom only on these | Glow on anything that isn't a light source |
| Typography: Belleza (display), Alegreya (serif), Alegreya Sans (UI) | Preview shells now, map labels in Phase 4 | Mono/tech fonts in user-facing UI |
| Soft easing (`cubic-bezier(.16,1,.3,1)` "settle", `(.76,0,.24,1)` "cinema"), 24 px card radius | Phase 4 camera and UI motion | — |

### B. Masar Destination: map experience (`references/masar/`)

| Take | Adapt for GMC | Avoid |
|---|---|---|
| The city as an **island on a dark ground**, roads as fine light lines | Map slab on a dark base, DUSK river glow line | Their flat teal colour scheme |
| **Two-tier fidelity**: white "clay" context city vs a fully materialised project area | `L_context_massing` in `M_clay`; heroes in full materials | Clay on hero objects |
| Day/night toggle | Our DAY/DUSK moods, required in every preview | — |
| **Component mode**: buildings hidden, one layer (e.g. roads) isolated and highlighted, camera flies top-down, numbers in large type | Separable `L_` layers (§5.3), so Phase 4 can do the same | Merging layers into one mesh |
| Tech stack: one Draco GLB (`city.glb`), baked `ao.jpg` + `light.jpg`, painted ground overlays, cloud textures, HDR env, Lottie icons | Our pipeline §5.4 / §9.5 | Shipping uncompressed GLBs in Phase 4 |
| Onboarding hints ("scroll to zoom", "drag to explore"), minimap, categories | Phase 4 | — |

### C. BIG: real-world objects (`references/big/`)

| Take | Adapt for GMC | Avoid |
|---|---|---|
| The **6-step axo sequence**: terrain + rivers → eco corridors → paddy terraces → urban fabric → mobility → inhabitable bridges | The map layer stack §5.3, 1:1 | — |
| 35 north–south rivers; braided gravel beds; density rising north → south; 11 mandala neighbourhoods; 3 mobility corridors | Map content §5 | Inventing districts BIG hasn't shown |
| Landmark forms: diamond-roof airport, textile-tiled stepped Temple-Dam in a gorge, stacked-roof Vajrayana bridge, slatted saddle healthcare centre, timber bracket bridges with medallions | Objects §6.1 | Generic "Asian" ornament |
| Materials: timber, stone, bamboo, lime-wash; warm interior glow | Material library §3.2 | Concrete/steel-dominant looks |

### D. Arena "Southern Foothills": terrain (`references/arena/`)

| Take | Adapt for GMC | Avoid |
|---|---|---|
| Terrain as a **thick slab with a stratified cut skirt** floating over dark water | Map form §5.2 and plinths §6.3 | Their bright orange/salmon skirt highlight |
| Vertical exaggeration as an explicit, controlled value (2.6×) | Fixed **1.5×** | Over-exaggerated, spiky relief |
| Layer toggles (rivers, forest, buildings, routes, boundaries, clouds, contours, labels), surface modes (satellite / elevation / slope), time of day | Layer naming §5.3; DAY/DUSK; Phase 4 toggles | Saturated satellite greens |
| Label pins with leader lines, an info card (elevation, notes), camera presets (Overview, Top-down, named places) | Anchors and leaders §6.3; camera views §8.5; Phase 4 cards | — |

---

## Sources

- Yoeja: https://yoeja.com/ (tokens read from the live site's CSS, 2026-11-22)
- Masar Destination 3D experience: https://www.masardestination.com.sa/en/experience
- BIG, Gelephu Mindfulness City: https://big.dk/projects/gelephu-mindfulness-city-16791
- Arena, Southern Foothills relief map: https://01a1f9b6-de9d-772b-b127-710ab7996d5c.arena.site/
- Dezeen, *BIG designs Mindfulness City in Bhutan connected by "inhabitable bridges"* (2023-12-20): https://www.dezeen.com/2023/12/20/big-mindfulness-city-bhutan-temple-dam/
- ArchDaily, *BIG Unveils Gelephu's 'Mindfulness City'*: https://www.archdaily.com/1011445/big-unveils-gelephus-mindfulness-city-bridging-bhutans-heritage-and-future
- Designboom, *BIG's mindfulness city in Bhutan*: https://www.designboom.com/architecture/big-mindfulness-city-bhutan-world-first-carbon-negative-country-12-21-2023/
- Elevation data: Copernicus GLO-30 DEM (ESA). Waterways and roads: OpenStreetMap.

*Images in `references/` are third-party and are for internal design reference only. Do not publish them.*
