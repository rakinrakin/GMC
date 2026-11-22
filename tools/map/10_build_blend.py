"""M1 step 4: build the GMC terrain slab in Blender (headless or live).

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
        -P tools/map/10_build_blend.py -- [--mood dusk|day] [--render V1,V1b] [--samples 96] [--res 1920x1080]

Blender axes: +Z up, +Y north, +X east (glTF export turns this into +Y up, -Z north: design.md §8.2).
1 unit = 1 m. Map origin = centre of the extent at sea level (map_meta.json: origin_utm46n).
"""
import bpy, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(bpy.path.abspath("//")) if bpy.data.filepath else Path(__file__).resolve().parents[2]
DATA = ROOT / "data/map"
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
MOOD = arg("--mood", "dusk")
RENDERS = [r for r in arg("--render", "").split(",") if r]
SAMPLES = int(arg("--samples", "96"))
RES = [int(v) for v in arg("--res", "1920x1080").split("x")]

EXAG = 1.5            # design.md §5.2
KEY_MULT = float(arg("--key", "2.2"))      # rig key -> Cycles sun strength
EXPOSURE = float(arg("--exposure", "0.9"))
VOID_GAIN = float(arg("--void", "7.0"))     # ACES crushes the void; author it brighter
GLOW = float(arg("--glow", "6.0"))          # settlement lamp-light emission (DUSK only)
CORNER_R = 3000.0     # rounded slab corners (m)
meta = json.loads((DATA / "map_meta.json").read_text())

def hexlin(s):
    s = s.lstrip("#"); c = [int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]

# ---------------------------------------------------------------- scene reset
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
    for d in list(coll):
        coll.remove(d)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"; scene.unit_settings.scale_length = 1.0

def new_coll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or scene.collection).children:
        (parent or scene.collection).children.link(c)
    return c
C_MODEL = new_coll("gmc_map_m1-terrain")
C_STAGE = new_coll("_stage (not exported)")

# ---------------------------------------------------------------- heightfield
RIVERS = "--no-rivers" not in argv
h = np.load(DATA / ("height_carved.npy" if RIVERS and (DATA / "height_carved.npy").exists() else "height_utm.npy")).astype(np.float64)
ny, nx = h.shape; cell = meta["cell_m"]
W, H = (nx - 1) * cell, (ny - 1) * cell
STRIDE = int(arg("--stride", "1"))          # 1 = 30 m render master; 2 = 60 m (web export source)
ny, nx = (ny - 1) // STRIDE + 1, (nx - 1) // STRIDE + 1
X, Y = np.meshgrid(np.linspace(-W / 2, W / 2, nx), np.linspace(H / 2, -H / 2, ny))

# rounded corners: map each corner square onto a quarter disc (elliptical grid mapping)
ax, ay = np.abs(X), np.abs(Y)
cx, cy = W / 2 - CORNER_R, H / 2 - CORNER_R
u, v = (ax - cx) / CORNER_R, (ay - cy) / CORNER_R
m = (u > 0) & (v > 0)
um, vm = u[m], v[m]
ax[m] = cx + um * np.sqrt(1 - vm ** 2 / 2) * CORNER_R
ay[m] = cy + vm * np.sqrt(1 - um ** 2 / 2) * CORNER_R
X, Y = np.sign(X) * ax, np.sign(Y) * ay

def bilinear(img, col, row):
    c0 = np.clip(np.floor(col).astype(int), 0, img.shape[1] - 2); r0 = np.clip(np.floor(row).astype(int), 0, img.shape[0] - 2)
    fc, fr = np.clip(col - c0, 0, 1), np.clip(row - r0, 0, 1)
    return (img[r0, c0] * (1 - fc) * (1 - fr) + img[r0, c0 + 1] * fc * (1 - fr)
            + img[r0 + 1, c0] * (1 - fc) * fr + img[r0 + 1, c0 + 1] * fc * fr)

Z = bilinear(h, (X + W / 2) / cell, (H / 2 - Y) / cell) * EXAG
z_low = float(Z.min())

def build_mesh(name, verts, faces_flat, nloop_per_face, uvs=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    nf = len(nloop_per_face)
    me.loops.add(len(faces_flat)); me.loops.foreach_set("vertex_index", faces_flat.astype(np.int32))
    me.polygons.add(nf)
    starts = np.concatenate([[0], np.cumsum(nloop_per_face)[:-1]]).astype(np.int32)
    me.polygons.foreach_set("loop_start", starts)
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", uvs[faces_flat].astype(np.float32).ravel())
    me.update(calc_edges=True)
    return me

# terrain faces: (r,c) (r+1,c) (r+1,c+1) (r,c+1)  -> normals up
idx = np.arange(ny * nx).reshape(ny, nx)
quads = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], -1).reshape(-1)
verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
uv = np.stack([(X + W / 2) / W, (Y + H / 2) / H], -1).reshape(-1, 2)
me_t = build_mesh("terrain_surface", verts, quads, np.full((ny - 1) * (nx - 1), 4), uv)
me_t.polygons.foreach_set("use_smooth", np.ones(len(me_t.polygons), bool))
ob_root = bpy.data.objects.new("gmc_map_m1-terrain", None); C_MODEL.objects.link(ob_root)
ob_L = bpy.data.objects.new("L_terrain", None); C_MODEL.objects.link(ob_L); ob_L.parent = ob_root
ob_t = bpy.data.objects.new("terrain_surface", me_t); C_MODEL.objects.link(ob_t); ob_t.parent = ob_L

# ---------------------------------------------------------------- skirt
SKIRT = max(0.06 * min(W, H), 1200.0)           # design.md §5.2
z_bot = z_low - SKIRT
ring = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
top = verts[ring]; n = len(ring)
bot = top.copy(); bot[:, 2] = z_bot
sv = np.concatenate([top, bot])
i = np.arange(n); j = (i + 1) % n
sk_quads = np.stack([i, j, j + n, i + n], -1).reshape(-1)
seg = np.linalg.norm(np.diff(np.vstack([top, top[:1]])[:, :2], axis=0), axis=1)
per = np.concatenate([[0], np.cumsum(seg)[:-1]])
sk_uv = np.concatenate([np.stack([per / SKIRT, (top[:, 2] - z_bot) / SKIRT], -1),
                        np.stack([per / SKIRT, np.zeros(n)], -1)])
faces = np.concatenate([sk_quads, n + np.arange(n)])        # + bottom cap (n-gon)
me_s = build_mesh("terrain_skirt", sv, faces, np.concatenate([np.full(n, 4), [n]]), sk_uv)
depth = np.concatenate([np.zeros(n), top[:, 2] - z_bot]).astype(np.float32)   # metres below the land surface
att = me_s.attributes.new("skirt_depth", "FLOAT", "POINT"); att.data.foreach_set("value", depth)
ob_s = bpy.data.objects.new("terrain_skirt", me_s); C_MODEL.objects.link(ob_s); ob_s.parent = ob_L

# ---------------------------------------------------------------- materials
def principled(mat):
    return next(nd for nd in mat.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")

def load_img(name, colorspace):
    im = bpy.data.images.load(str(DATA / name), check_existing=True)
    im.colorspace_settings.name = colorspace
    return im

# M_terrain: baked albedo (land cover) + water gloss + canopy micro-relief
mt = bpy.data.materials.new("M_terrain"); nt = mt.node_tree; bs = principled(mt)
tc = nt.nodes.new("ShaderNodeTexCoord")
alb = nt.nodes.new("ShaderNodeTexImage"); alb.image = load_img("terrain_albedo.png", "sRGB"); alb.interpolation = "Cubic"
wat = nt.nodes.new("ShaderNodeTexImage"); wat.image = load_img("terrain_water.png", "Non-Color")
nt.links.new(tc.outputs["UV"], alb.inputs["Vector"]); nt.links.new(tc.outputs["UV"], wat.inputs["Vector"])
nt.links.new(alb.outputs["Color"], bs.inputs["Base Color"])
rmix = nt.nodes.new("ShaderNodeMapRange"); rmix.inputs["To Min"].default_value = 0.95; rmix.inputs["To Max"].default_value = 0.08
nt.links.new(wat.outputs["Color"], rmix.inputs["Value"]); nt.links.new(rmix.outputs["Result"], bs.inputs["Roughness"])
if "Coat Weight" in bs.inputs:
    nt.links.new(wat.outputs["Color"], bs.inputs["Coat Weight"])
# canopy micro-relief: fine noise in object space (~40 m), suppressed on water
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1 / 45.0
noise.inputs["Detail"].default_value = 6.0
nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
nt.links.new(wat.outputs["Color"], inv.inputs[1])
bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Distance"].default_value = 25.0
nt.links.new(inv.outputs[0], bump.inputs["Strength"]); bump.inputs["Strength"].default_value = 0.35
nt.links.new(noise.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
# DUSK lamp-light: settlements (WorldCover built-up) glow honey, broken into points of light
if MOOD == "dusk":
    blt = nt.nodes.new("ShaderNodeTexImage"); blt.image = load_img("terrain_built.png", "Non-Color")
    nt.links.new(tc.outputs["UV"], blt.inputs["Vector"])
    spark = nt.nodes.new("ShaderNodeTexVoronoi"); spark.inputs["Scale"].default_value = 1 / 70.0
    nt.links.new(tc.outputs["Object"], spark.inputs["Vector"])
    sp_r = nt.nodes.new("ShaderNodeMapRange"); sp_r.inputs["From Min"].default_value = 0.0; sp_r.inputs["From Max"].default_value = 0.35
    sp_r.inputs["To Min"].default_value = 1.0; sp_r.inputs["To Max"].default_value = 0.15
    nt.links.new(spark.outputs["Distance"], sp_r.inputs["Value"])
    gm = nt.nodes.new("ShaderNodeMath"); gm.operation = "MULTIPLY"
    nt.links.new(blt.outputs["Color"], gm.inputs[0]); nt.links.new(sp_r.outputs["Result"], gm.inputs[1])
    gs = nt.nodes.new("ShaderNodeMath"); gs.operation = "MULTIPLY"; gs.inputs[1].default_value = GLOW
    nt.links.new(gm.outputs[0], gs.inputs[0])
    bs.inputs["Emission Color"].default_value = hexlin("#FFC450")      # honey
    nt.links.new(gs.outputs[0], bs.inputs["Emission Strength"])
me_t.materials.append(mt)

# M_skirt: horizontal strata. soil band (top 8%) -> umber-earth streaks -> umber-deep at the bottom
ms = bpy.data.materials.new("M_skirt"); ns = ms.node_tree; bss = principled(ms)
bss.inputs["Roughness"].default_value = 1.0
attr = ns.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "skirt_depth"
geo = ns.nodes.new("ShaderNodeNewGeometry")
sep = ns.nodes.new("ShaderNodeSeparateXYZ"); ns.links.new(geo.outputs["Position"], sep.inputs[0])
# t_bottom: 0 at the bottom of the skirt, 1 at the lowest land level
tb = ns.nodes.new("ShaderNodeMapRange"); tb.inputs["From Min"].default_value = z_bot; tb.inputs["From Max"].default_value = z_low + 600
ns.links.new(sep.outputs["Z"], tb.inputs["Value"])
# strata streaks: noise stretched horizontally (scale x small, z large)
mapn = ns.nodes.new("ShaderNodeMapping"); mapn.inputs["Scale"].default_value = (0.004, 0.004, 0.05)
ns.links.new(geo.outputs["Position"], mapn.inputs["Vector"])
st = ns.nodes.new("ShaderNodeTexNoise"); st.inputs["Scale"].default_value = 1.0; st.inputs["Detail"].default_value = 8
st.inputs["Roughness"].default_value = 0.65
ns.links.new(mapn.outputs["Vector"], st.inputs["Vector"])
ramp_s = ns.nodes.new("ShaderNodeValToRGB")
ramp_s.color_ramp.elements[0].position = 0.35; ramp_s.color_ramp.elements[0].color = hexlin("#1d0f07")
ramp_s.color_ramp.elements[1].position = 0.7; ramp_s.color_ramp.elements[1].color = hexlin("#2a1a0d")
ns.links.new(st.outputs["Fac"], ramp_s.inputs["Fac"])
deep = ns.nodes.new("ShaderNodeMix"); deep.data_type = "RGBA"
deep.inputs["A"].default_value = hexlin("#180C05")
ns.links.new(tb.outputs["Result"], deep.inputs["Factor"]); ns.links.new(ramp_s.outputs["Color"], deep.inputs["B"])
# soil band from the attribute (depth below surface)
soil_t = ns.nodes.new("ShaderNodeMapRange"); soil_t.inputs["From Min"].default_value = 0.08 * SKIRT * 0.9
soil_t.inputs["From Max"].default_value = 0.08 * SKIRT * 1.1
ns.links.new(attr.outputs["Fac"], soil_t.inputs["Value"])
soil = ns.nodes.new("ShaderNodeMix"); soil.data_type = "RGBA"; soil.inputs["A"].default_value = hexlin("#4A3A2C")
ns.links.new(soil_t.outputs["Result"], soil.inputs["Factor"]); ns.links.new(deep.outputs["Result"], soil.inputs["B"])
# 1 px-ish lighter lip right under the land edge
lip_t = ns.nodes.new("ShaderNodeMapRange"); lip_t.inputs["From Min"].default_value = 18; lip_t.inputs["From Max"].default_value = 40
ns.links.new(attr.outputs["Fac"], lip_t.inputs["Value"])
lip = ns.nodes.new("ShaderNodeMix"); lip.data_type = "RGBA"; lip.inputs["A"].default_value = hexlin("#5a4634")
ns.links.new(lip_t.outputs["Result"], lip.inputs["Factor"]); ns.links.new(soil.outputs["Result"], lip.inputs["B"])
ns.links.new(lip.outputs["Result"], bss.inputs["Base Color"])
bmp = ns.nodes.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = 0.4; bmp.inputs["Distance"].default_value = 30
ns.links.new(st.outputs["Fac"], bmp.inputs["Height"]); ns.links.new(bmp.outputs["Normal"], bss.inputs["Normal"])
me_s.materials.append(ms)


# ---------------------------------------------------------------- L_water_rivers (M2)
ob_r = None
if RIVERS and (DATA / "rivers.json").exists():
    rj = json.loads((DATA / "rivers.json").read_text())
    def rr_sdf(x, y, inset):
        qx, qy = np.abs(x) - (W / 2 - CORNER_R), np.abs(y) - (H / 2 - CORNER_R)
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - CORNER_R + inset
    rv, rf, ruv = [], [], []
    base_i = 0
    for rvr in rj["rivers"]:
        p = np.array(rvr["pts"])
        p = p[rr_sdf(p[:, 0], p[:, 1], 150) < 0]
        if len(p) < 3:
            continue
        t = np.gradient(p[:, :2], axis=0); t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
        nrm = np.stack([-t[:, 1], t[:, 0]], -1)
        half = (p[:, 3] / 2)[:, None]
        L = p[:, :2] + nrm * half; R = p[:, :2] - nrm * half
        z = p[:, 2] * EXAG
        n = len(p)
        rv.append(np.concatenate([np.column_stack([L, z]), np.column_stack([R, z])]))
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p[:, :2], axis=0), axis=1))])
        ruv.append(np.concatenate([np.column_stack([along / 100, np.ones(n)]), np.column_stack([along / 100, np.zeros(n)])]))
        i = np.arange(n - 1)
        rf.append(np.stack([i, i + n, i + n + 1, i + 1], -1) + base_i)
        base_i += 2 * n
    rv = np.concatenate(rv); rf = np.concatenate(rf); ruv = np.concatenate(ruv)
    me_r = build_mesh("river_channels", rv, rf.reshape(-1), np.full(len(rf), 4), ruv)
    me_r.polygons.foreach_set("use_smooth", np.ones(len(me_r.polygons), bool))
    ob_Lw = bpy.data.objects.new("L_water_rivers", None); C_MODEL.objects.link(ob_Lw); ob_Lw.parent = ob_root
    ob_r = bpy.data.objects.new("river_channels", me_r); C_MODEL.objects.link(ob_r); ob_r.parent = ob_Lw
    # M_water (design.md §3.2): river-water, glossy clearcoat, 2-octave ripple normal
    mw = bpy.data.materials.new("M_water"); nw = mw.node_tree; bw = principled(mw)
    bw.inputs["Base Color"].default_value = hexlin("#2C5560"); bw.inputs["Roughness"].default_value = 0.08
    if "Coat Weight" in bw.inputs:
        bw.inputs["Coat Weight"].default_value = 1.0; bw.inputs["Coat Roughness"].default_value = 0.05
    tcw_ = nw.nodes.new("ShaderNodeTexCoord")
    rip = nw.nodes.new("ShaderNodeTexNoise"); rip.inputs["Scale"].default_value = 1 / 40.0; rip.inputs["Detail"].default_value = 2
    nw.links.new(tcw_.outputs["Object"], rip.inputs["Vector"])
    rb = nw.nodes.new("ShaderNodeBump"); rb.inputs["Strength"].default_value = 0.25; rb.inputs["Distance"].default_value = 2.0
    nw.links.new(rip.outputs["Fac"], rb.inputs["Height"]); nw.links.new(rb.outputs["Normal"], bw.inputs["Normal"])
    me_r.materials.append(mw)
    print("@@RIVERS", json.dumps(dict(channels=len(rj["rivers"]), tris=len(rf) * 2)))

# ---------------------------------------------------------------- stage: base disc, rig, world, camera
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=420000, fill_type="NGON", location=(0, 0, z_bot - 300))
base = bpy.context.active_object; base.name = "stage_base"
for c in base.users_collection: c.objects.unlink(base)
C_STAGE.objects.link(base)
mb = bpy.data.materials.new("stage_base_dark"); bb = principled(mb)
bb.inputs["Base Color"].default_value = hexlin("#141820"); bb.inputs["Roughness"].default_value = 0.3
base.data.materials.append(mb)

MOODS = {
    "dusk": dict(key="#FFB978", key_e=3.0, az=255, el=18, sky="#3A4A6E", ground="#221208", hemi=0.9,
                 bg_top="#0B0E18", bg_bot="#18130F"),
    "day": dict(key="#FFF3DC", key_e=3.2, az=215, el=45, sky="#DFE6EE", ground="#7A736A", hemi=0.9,
                bg_top="#DCE1E6", bg_bot="#B9BEC2"),
}
mo = MOODS[MOOD]
sun_d = bpy.data.lights.new("rig_key", "SUN"); sun_d.color = hexlin(mo["key"])[:3]
sun_d.energy = mo["key_e"] * KEY_MULT; sun_d.angle = math.radians(1.5)
sun = bpy.data.objects.new("rig_key", sun_d); C_STAGE.objects.link(sun)
az, el = math.radians(mo["az"]), math.radians(mo["el"])
to_light = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
sun.rotation_euler = to_light.to_track_quat("Z", "Y").to_euler()

# world: camera rays see the void gradient; lighting sees the hemisphere (sky/ground)
world = bpy.data.worlds.get("GMC") or bpy.data.worlds.new("GMC"); scene.world = world
wn = world.node_tree; wn.nodes.clear()
out = wn.nodes.new("ShaderNodeOutputWorld")
lp = wn.nodes.new("ShaderNodeLightPath")
tcw = wn.nodes.new("ShaderNodeTexCoord"); sepw = wn.nodes.new("ShaderNodeSeparateXYZ")
wn.links.new(tcw.outputs["Generated"], sepw.inputs[0])
hemi = wn.nodes.new("ShaderNodeMix"); hemi.data_type = "RGBA"
hemi.inputs["A"].default_value = hexlin(mo["ground"]); hemi.inputs["B"].default_value = hexlin(mo["sky"])
hm = wn.nodes.new("ShaderNodeMapRange"); hm.inputs["From Min"].default_value = -0.3; hm.inputs["From Max"].default_value = 0.6
wn.links.new(sepw.outputs["Z"], hm.inputs["Value"]); wn.links.new(hm.outputs["Result"], hemi.inputs["Factor"])
bg_light = wn.nodes.new("ShaderNodeBackground"); bg_light.inputs["Strength"].default_value = mo["hemi"] * float(arg("--hemi", "1.8"))
wn.links.new(hemi.outputs["Result"], bg_light.inputs["Color"])
void = wn.nodes.new("ShaderNodeMix"); void.data_type = "RGBA"
void.inputs["A"].default_value = [c * VOID_GAIN for c in hexlin(mo["bg_bot"])[:3]] + [1]
void.inputs["B"].default_value = [c * VOID_GAIN for c in hexlin(mo["bg_top"])[:3]] + [1]
vm_ = wn.nodes.new("ShaderNodeMapRange"); vm_.inputs["From Min"].default_value = -0.6; vm_.inputs["From Max"].default_value = 0.4
wn.links.new(sepw.outputs["Z"], vm_.inputs["Value"]); wn.links.new(vm_.outputs["Result"], void.inputs["Factor"])
bg_void = wn.nodes.new("ShaderNodeBackground"); bg_void.inputs["Strength"].default_value = 1.0
wn.links.new(void.outputs["Result"], bg_void.inputs["Color"])
mixs = wn.nodes.new("ShaderNodeMixShader")
wn.links.new(lp.outputs["Is Camera Ray"], mixs.inputs["Fac"])
wn.links.new(bg_light.outputs["Background"], mixs.inputs[1]); wn.links.new(bg_void.outputs["Background"], mixs.inputs[2])
wn.links.new(mixs.outputs["Shader"], out.inputs["Surface"])

# cameras (design.md §8.5). Blender north = +Y.
def add_cam(name, target, yaw_west_deg, pitch_deg, dist, fov=30):
    cd = bpy.data.cameras.new(name); cd.lens_unit = "FOV"; cd.angle = math.radians(fov)
    cd.clip_start = 50; cd.clip_end = 1_000_000
    cam = bpy.data.objects.new(name, cd); C_STAGE.objects.link(cam)
    yw, pt = math.radians(yaw_west_deg), math.radians(pitch_deg)
    d = Vector((-math.sin(yw) * math.cos(pt), math.cos(yw) * math.cos(pt), -math.sin(pt)))
    cam.location = Vector(target) - d * dist
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return cam

zc = float(np.median(Z))
cams = {
    "V1": add_cam("cam_V1_overview", (-1500, -1500, zc), 20, 45, 228000),
    # V1b: the Gelephu plain and its braided rivers, closer (same projection rules)
    "V1b": add_cam("cam_V1b_gelephu", (17500, -9000, 400), 20, 40, 62000),
    # V5r: river detail on the Sankosh meanders (west edge)
    "V5r": add_cam("cam_V5r_sankosh", (-33000, -11000, 600), 20, 38, 19000),
    "V3": None,
}
cd = bpy.data.cameras.new("cam_V3_plan"); cd.type = "ORTHO"; cd.ortho_scale = W * 1.04; cd.clip_end = 1_000_000
c3 = bpy.data.objects.new("cam_V3_plan", cd); C_STAGE.objects.link(c3); c3.location = (0, 0, 60000)
cams["V3"] = c3

# ---------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    scene.cycles.device = "GPU"
except Exception as e:
    print("GPU setup failed, CPU:", e)
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.film_transparent = False
vs = scene.view_settings
for vt in ("ACES 2.0", "ACES 1.3", "AgX"):
    try:
        vs.view_transform = vt; break
    except TypeError:
        continue
vs.exposure = EXPOSURE
print("view transform:", vs.view_transform)

stats = dict(terrain_verts=len(me_t.vertices), terrain_tris=len(me_t.polygons) * 2,
             skirt_depth_m=round(SKIRT), z_low=round(z_low), z_high=round(float(Z.max())),
             size_km=[round(W / 1000, 2), round(H / 1000, 2)], view=vs.view_transform)
print("@@STATS", json.dumps(stats))

EXPORT = arg("--export", "")
if not EXPORT:
    blend = ROOT / "models/map/gmc_map_m1-terrain_v01.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
for r in RENDERS:
    scene.camera = cams[r]
    scene.render.filepath = str(ROOT / f"previews/gmc_map_m1-terrain_v01_{r}-{MOOD}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)

if EXPORT:
    # ---- web hand-off GLB (design.md §8.4 / §9.5): terrain <= 800k tris, albedo 4096 wide
    target = int(arg("--tris", "790000"))
    ratio = target / (len(me_t.polygons) * 2)
    if ratio < 1:
        mod = ob_t.modifiers.new("decimate", "DECIMATE"); mod.decimate_type = "COLLAPSE"; mod.ratio = ratio
        with bpy.context.temp_override(object=ob_t, active_object=ob_t, selected_objects=[ob_t], selected_editable_objects=[ob_t]):
            print("apply decimate", bpy.ops.object.modifier_apply(modifier="decimate"))
    img = alb.image
    if img.size[0] > 4096:
        img.scale(4096, round(4096 * img.size[1] / img.size[0]))
    # terrain for glTF: albedo + flat roughness only. (Linking the water mask into Roughness/Coat made the
    # exporter write it as roughness/clearcoat maps -> roughness 0 on all land = sun glints everywhere.)
    for lk in list(nt.links):
        if lk.to_node == bs and lk.to_socket.name != "Base Color":
            nt.links.remove(lk)
    bs.inputs["Roughness"].default_value = 0.95
    if "Coat Weight" in bs.inputs:
        bs.inputs["Coat Weight"].default_value = 0.0
    bs.inputs["Emission Strength"].default_value = 0.0
    # skirt: plain umber-earth for the hand-off (the kit's createSkirt() draws the strata on the web)
    ms.node_tree.nodes.clear()
    o = ms.node_tree.nodes.new("ShaderNodeOutputMaterial"); b = ms.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = hexlin("#221208"); b.inputs["Roughness"].default_value = 1.0
    ms.node_tree.links.new(b.outputs[0], o.inputs[0])
    for ob in bpy.context.view_layer.objects:
        ob.select_set(ob.name in ("gmc_map_m1-terrain", "L_terrain", "terrain_surface", "terrain_skirt", "L_water_rivers", "river_channels"))
    out_path = ROOT / EXPORT
    res = bpy.ops.export_scene.gltf(filepath=str(out_path), export_format="GLB", use_selection=True,
                                    export_yup=True, export_apply=True, export_image_format="AUTO")
    tris = sum(len(o.data.loop_triangles) for o in (ob_t, ob_s) if not o.data.calc_loop_triangles())
    print("@@EXPORT", json.dumps(dict(result=list(res), path=str(out_path), terrain_tris=len(ob_t.data.loop_triangles),
                                       skirt_tris=len(ob_s.data.loop_triangles), size_mb=round(out_path.stat().st_size / 1e6, 1))))
