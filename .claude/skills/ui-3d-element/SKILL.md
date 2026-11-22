---
name: "ui-3d-element"
description: "Use when building any interactive 3D element or hero for a UI/UX project (three.js/WebGL objects, product showcases, playful widgets). Sets the minimum quality bar, art direction and build/verify workflow."
---

# Interactive 3D element for UI/UX — minimum standard

The reference bar is the GTR::01 guitar: a code-built three.js object with procedural PBR textures, studio lighting, real interaction, sound, and a matching UI shell (theme-able). Every new 3D element must meet or beat it. Nothing below is optional unless the user says so.

## 1. Direction (decide before writing code)

Write down in one short paragraph, before building:
- **Object & story**: what it is, and the one interaction that makes it *alive* (pluck a string, spin a record, flip a switch). An object that only rotates is not finished.
- **Theme**: take it from the project (brand colors, fonts, design system) or ask the user. Put it in one `THEME` object at the top of the file and drive both the CSS variables and the 3D scene (background, accent light, glow color, emissive markers) from it, so the theme can be swapped by editing one place. The quality bar below is fixed; the theme is not. Rendering realism stays stylized-real (not cartoon, not photoreal) unless asked.
- **Feedback loop**: every action gets visual + UI + (where it fits) audio feedback: object reacts, panel text updates, a meter moves, a sound plays.
- **Variants**: give at least one meaningful switch (finish/colorway/mode) so the object shows off its materials.

## 1b. Theme tokens

```js
const THEME = {
  bg: '#19191a', bgCenter: '#3d3d40', bgEdge: '#1e1e20', // scene background (author ~2x brighter: ACES darkens it)
  grid: 'rgba(255,255,255,0.09)',                       // dot grid, or null to disable
  text: '#e9e6df', dim: '#7c7c80', line: '#2a2a2c', panel: 'rgba(15,15,16,.94)',
  accent: '#ff7a45',  // highlights, active markers, glow
  live: '#43d17a',    // "active / signal" state
  fontUI: 'Inter', fontMono: 'JetBrains Mono',
  labelStyle: 'KEY::VALUE', // or 'Key: value', etc.
  envTint: { warm: 0xffe2c8, cool: 0xb9c9ff },
};
```
Example presets: **Dark editorial** (above), **Light studio** (bg `#f2f1ee`, centre `#ffffff`, text `#141414`, studio room box `0x9a9a9e`, lower panel intensities ~30%), **Brand** (derive accent/live from the brand palette, keep contrast AA on UI text). Light themes: raise the env room color, drop shadow opacity to ~0.25, and lower bloom.

## 2. Quality bar (checklist — all must pass)

**Geometry**
- Silhouettes from closed Catmull-Rom curves (`centripetal`, 600–900 points) → `ExtrudeGeometry` with generous bevel (bevelSegments ≥ 10). No visibly faceted highlights.
- `RoundedBoxGeometry` instead of boxes for anything the eye lands on; `LatheGeometry` for knobs, caps, buttons.
- Real-object proportions and detail: screws, seams, tapers, rounded wires, small hardware. Detail density should reward zooming to ~25% distance.

**Materials (PBR, procedural — no flat colors on hero surfaces)**
- Every visible material has at least one of: albedo texture, normal map, roughness map, clearcoat, iridescence, sheen, anisotropy.
- Generate textures on canvas with seeded value-noise + fbm (recipes in §5): wood (grain + pores + normal + roughness), metallic flake normals, brushed-metal roughness streaks, tortoise/marble, winding/knurl normals, gold-foil decals with alphaTest.
- Color maps `SRGBColorSpace`; data maps (normal/roughness) linear. Max anisotropy on every texture.
- Extruded caps use raw (x,y) UVs → set `repeat = 1/size`, `offset = -min/size`. Use the material array `[capMat, sideMat]` (group 0 = caps, group 1 = sides/bevel).

**Lighting**
- Custom studio environment via `PMREMGenerator.fromScene`: a dim room box (~#18181a, never pure black or chrome turns into black holes) + 4–6 emissive softbox/strip panels (key, rim strip, floor kicker, warm side, cool back, overhead) with intensity 1–6.
- One `DirectionalLight` with soft shadows (`PCFSoftShadowMap`, 2048 map, tight frustum) onto a `ShadowMaterial` plane just behind/below the object for grounding.
- An interaction-driven accent light (e.g. warm point light that swells when the object is active).

**Rendering / post**
- `EffectComposer` with HalfFloat MSAA target (`samples: 4`) → `RenderPass` → subtle `UnrealBloomPass` (strength ~0.2, threshold ~0.95) → `OutputPass`. ACES tone mapping.
- Do **not** use `GTAOPass` with a transparent shadow plane — it produced a black rectangular artifact. Ground with shadows instead.
- Background drawn into `scene.background` as a screen-sized canvas from `THEME` (radial vignette + optional dot grid). ACES darkens it, so author ~2× brighter than the target.
- Quality toggle chip (HIGH/LOW: pixel ratio 2→1, bloom off) plus auto-downgrade if FPS < ~34 after 3.5 s.

**Interaction**
- Hover highlight (emissive tint), cursor changes (grab / grabbing / pointer / move).
- Drag empty space = rotate with damping and spring back; idle float + mouse parallax.
- Zoom: wheel + pinch + `+`/`-`, **zoom toward cursor**, clamp 0.22–1.6; shift/right-drag pan; double-click or `0` resets. Never ship without zoom.
- Thin or small targets get invisible, fatter hit meshes (`visible = false` still raycasts).
- Keyboard shortcuts for the main actions; a hint block top-right listing every gesture.
- Responsive: portrait viewports rotate the object 90° and refit the camera from required width/height.

**Motion & sound**
- Animate with physics-ish curves (exponential decay, damped springs), not linear tweens. Vertex-level deformation where it sells the action (e.g. string displacement shaped by the vibrating length).
- Sound synthesized in WebAudio when possible (Karplus-Strong for plucks, filtered noise for clicks), through compressor + short delay. Audio context created on first gesture.

**UI shell**
- Telemetry chips top-left (`FPS::60`, state, counters), variant switcher top-center, hint block top-right, and a bottom panel: status line (`AMP::LIVE` / `● SIGNAL`), large state text, mono sub-line, action chips, live meters.
- Loading screen while textures build (`BUILDING::TEXTURES`), faded out after first frame.

## 3. Build workflow

1. Single self-contained HTML file. three.js `0.160.0` via importmap from `cdn.jsdelivr.net` (works on most sandboxed hosts and claude.ai artifacts); addons from `three/addons/`. Top-level `await` is fine in the module. If the project uses a bundler/React, port the same sections into a component (`@react-three/fiber` is fine) but keep the quality bar.
2. Structure the module in sections: theme → renderer → texture kit → environment → lights → groups → materials → geometry → interactive parts → post → audio → UI state → interaction → camera/zoom → loop.
3. Build textures before first render; yield one frame first so the loader paints.
4. Syntax-check the extracted module (`node --check`) before every delivery.
5. Deliver where the user can open it: a published artifact/page, or the file in their project.

## 4. Verification (mandatory before saying it's done)

Look at the real render in a browser before delivering — never ship unseen.
1. Open the page in any available browser (local preview, dev server, browser tool). If the sandbox can't reach the CDN, build a harness: the HTML minus the importmap, with each import rewritten to `await import('https://cdn.jsdelivr.net/npm/three@0.160.0/+esm')` / `.../examples/jsm/<path>.js/+esm`, wrapped in an async IIFE that sets `window.__err` / `window.__ok` and exposes `window.__api` (variant switch, `setView(zoom, panX, panY, rx, ry, rz)`, pass toggles, render). Inject it into any plain page (e.g. example.com) with a JS-exec tool.
2. Screenshot: full view, every variant/theme, and at least two close-ups at ~0.2–0.3 zoom (main detail area + smallest detail). Check for: black/blown chrome, artifacts, faceted edges, illegible decals, background too dark/light, object hidden behind UI panels.
3. Fix, re-check, then deliver. Tell the user honestly what was and wasn't verified.

## 5. Code recipes

```js
// seeded value noise + fbm
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd=mulberry(1337), perm=new Uint8Array(512), grad=new Float32Array(256);
{const p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=Math.floor(rnd()*(i+1));[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)perm[i]=p[i&255];for(let i=0;i<256;i++)grad[i]=rnd()*2-1;}
function noise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,X=xi&255,Y=yi&255;const a=grad[perm[X+perm[Y]]],b=grad[perm[X+1+perm[Y]]],c=grad[perm[X+perm[Y+1]]],d=grad[perm[X+1+perm[Y+1]]];const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,y,o=4){let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*noise(x*f,y*f);f*=2.03;a*=.5;}return s;}

// paint a canvas per-pixel; height field -> normal map
function paint(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,col=fn(x,y);d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=col[3]??255;}g.putImageData(im,0,0);return c;}
function normalFrom(H,w,h,s){return paint(w,h,(x,y)=>{const l=H[y*w+(x-1+w)%w],r=H[y*w+(x+1)%w],u=H[((y-1+h)%h)*w+x],dn=H[((y+1)%h)*w+x];const nx=(l-r)*s,ny=(dn-u)*s,il=1/Math.hypot(nx,ny,1);return[(nx*il*.5+.5)*255,(ny*il*.5+.5)*255,(il*.5+.5)*255];});}

// wood: grain along x. returns {map, normal, rough}
// t = pow(0.5+0.5*sin((y + fbm(x*sx, y*.018)*warp)*rings + fbm(x*.0015,y*.004,2)*5), contrast)*.68
//   + (0.5+0.5*fbm(x*.05, y*.7, 2))*.32;  pores: if noise(x*.3+50, y*1.9) > .6 → t -= pore
// rosewood: dark #170d08 light #4b2a19 rings .11 warp 45 contrast 1.5 pore .22 bump 3.5
// maple:    dark #8d5a2c light #d39b5c rings .05 warp 28 contrast .85 pore .05 bump 1.6

// studio environment
function studio(pmrem){const s=new THREE.Scene();s.add(new THREE.Mesh(new THREE.BoxGeometry(40,40,40),new THREE.MeshBasicMaterial({color:0x18181a,side:THREE.BackSide})));
 const panel=(w,h,i,pos,col=0xffffff)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(i),side:THREE.DoubleSide}));m.position.copy(pos);m.lookAt(0,0,0);s.add(m);};
 panel(12,5,5,new THREE.Vector3(-7,9,9));panel(1.4,16,6,new THREE.Vector3(11,1,5));panel(16,1,3.5,new THREE.Vector3(0,-7,10));
 panel(1,12,3,new THREE.Vector3(-12,-1,2),0xffe2c8);panel(8,8,1.2,new THREE.Vector3(2,5,-12),0xb9c9ff);panel(10,10,1.6,new THREE.Vector3(0,14,2));
 return pmrem.fromScene(s,0.02).texture;}

// smooth closed silhouette
function closed(pts,n=900){const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],0)),true,'centripetal');const sp=curve.getPoints(n);const s=new THREE.Shape();s.moveTo(sp[0].x,sp[0].y);for(let i=1;i<sp.length;i++)s.lineTo(sp[i].x,sp[i].y);return{shape:s,curve};}

// cylinder between two points (wires, strings, rods); hseg high if it will deform
function rodBetween(a,b,r,mat,radial=10,hseg=1){const len=a.distanceTo(b);const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,radial,hseg,true),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}

// zoom toward cursor
function zoomAt(cx,cy,f){const nz=clamp(zoomT*f,.22,1.6);ray.setFromCamera(toNDC(cx,cy),camera);if(ray.ray.intersectPlane(zPlane,hit)){const k=1-nz/zoomT;panT.x+=(hit.x-pan.x)*k;panT.y+=(hit.y-(baseCY+pan.y))*k;}zoomT=nz;if(zoomT>=.999)panT.set(0,0,0);}
```

Material presets that worked:
- Metallic flake paint: `MeshPhysical{color:0x1d2232, metalness:.7, roughness:.32, normalMap:flake(rep 9), normalScale:.7, clearcoat:1, clearcoatRoughness:.025}`
- Gloss burst: `map:sunburst, roughness:.42, clearcoat:1, clearcoatRoughness:.03` + dark side material
- Pearl inlay: `iridescence:1, iridescenceIOR:1.7, iridescenceThicknessRange:[180,620], roughness:.18, clearcoat:1`
- Brushed metal: `metalness:1, roughnessMap:streaks, anisotropy:.8`
- Chrome `roughness .1`, nickel `0xd8d4cc roughness .16`
- Gold decal: `color:0xf0c86a, metalness:.65, roughness:.3, alphaTest:.35`

## 6. When to escalate to Blender

Code-built is the default and is enough for stylized product shots. Recommend Blender (via Blender tools/MCP if connected: model → bake lighting/AO into textures → export GLB) when the user wants photoreal: sculpted organic contours, baked contact shadows, scanned/worn materials. Say this plainly when delivering.

## 7. Delivery

Deliver the page, then reply briefly: what it is, what's interactive, what was verified in-browser, known limits, and one honest next step.