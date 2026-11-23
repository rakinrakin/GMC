"""Blender half of the asset pipeline: terrain meshes (Draco GLB) and the baked colour render.

Run headless from the repo root (never saves the .blend):
  /Applications/Blender.app/Contents/MacOS/Blender -b <GMC>/relief-test/gmc_relief_test.blend \
      --python-exit-code 1 -P gelephu-story/tools/export_assets.py

Outputs
  public/assets/terrain_desktop.glb, terrain_mobile.glb
  tools/.build/shaped_z.npy     shaped heights (km), 1216 x 1792, row 0 = north (for build_maps.py)
  tools/.build/extent.json      x/y extent in km
  tools/.build/color_full.png   top-down orthographic Cycles bake, 4096 x 2779

Scene units are km with Z up. The glTF exporter converts to +Y up, so three.js sees
(x, y, z)_blender -> (x, z, -y): east = +X, up = +Y, north = -Z.
UV0 in the GLB: u = (x - xmin) / (xmax - xmin), v = (y - ymin) / (ymax - ymin), so v = 1 is north.
"""
import json
import math
import os
import sys
from pathlib import Path

import bpy
import numpy as np

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
ASSETS = ROOT / "public" / "assets"
BUILD = TOOLS / ".build"

GRID_ROWS, GRID_COLS = 1216, 1792
MESHES = {"desktop": (430, 292), "mobile": (240, 163)}  # (cols, rows) of vertices
TRI_CAP = {"desktop": 260_000, "mobile": 85_000}
BAKE_RES = (4096, 2779)
SAMPLES = 64
SKIP_RENDER = os.environ.get("GMC_SKIP_RENDER") == "1"


def log(*a):
    print("[export_assets]", *a, flush=True)


# ---------------------------------------------------------------- shaped heights

def read_shaped_grid():
    terrain = bpy.data.objects["GMC_Terrain"]
    if len(terrain.modifiers):
        log("modifiers on GMC_Terrain:", [m.name for m in terrain.modifiers], "(using evaluated mesh)")
    dg = bpy.context.evaluated_depsgraph_get()
    ev = terrain.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    assert n == GRID_ROWS * GRID_COLS, f"GMC_Terrain has {n} verts, expected {GRID_ROWS * GRID_COLS}"
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    co = co.reshape(GRID_ROWS, GRID_COLS, 3)
    mw = np.array(terrain.matrix_world)
    assert np.allclose(mw, np.eye(4)), "GMC_Terrain must have identity transform"
    x = co[0, :, 0].astype(np.float64)
    y = co[:, 0, 1].astype(np.float64)
    assert np.all(np.diff(x) > 0) and np.all(np.diff(y) < 0), "grid must be row-major, west->east, north->south"
    return x, y, co[..., 2].astype(np.float64)


def bilinear(z, fr, fc):
    """Sample grid z at fractional row/col index arrays (broadcast)."""
    r0 = np.clip(np.floor(fr).astype(int), 0, z.shape[0] - 2)
    c0 = np.clip(np.floor(fc).astype(int), 0, z.shape[1] - 2)
    tr = fr - r0
    tc = fc - c0
    return ((1 - tr) * (1 - tc) * z[r0, c0] + (1 - tr) * tc * z[r0, c0 + 1]
            + tr * (1 - tc) * z[r0 + 1, c0] + tr * tc * z[r0 + 1, c0 + 1])


# ---------------------------------------------------------------- meshes

def build_mesh(name, x, y, z, cols, rows):
    xmin, xmax, ymax, ymin = x[0], x[-1], y[0], y[-1]
    fc = np.linspace(0, GRID_COLS - 1, cols)  # x spacing is uniform in the source grid
    fr = np.linspace(0, GRID_ROWS - 1, rows)
    FR, FC = np.meshgrid(fr, fc, indexing="ij")
    zz = bilinear(z, FR, FC)
    xs = np.interp(fc, np.arange(GRID_COLS), x)
    ys = np.interp(fr, np.arange(GRID_ROWS), y)
    XX, YY = np.meshgrid(xs, ys)
    verts = np.stack([XX, YY, zz], -1).reshape(-1, 3).astype(np.float32)

    idx = np.arange(rows * cols).reshape(rows, cols)
    a = idx[:-1, :-1].ravel()
    b = idx[:-1, 1:].ravel()
    c = idx[1:, 1:].ravel()
    d = idx[1:, :-1].ravel()
    # Rows run north -> south, so (a, d, c) / (a, c, b) is counter-clockwise seen from +Z.
    tris = np.concatenate([np.stack([a, d, c], 1), np.stack([a, c, b], 1)]).astype(np.int32)

    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.ravel())
    me.loops.add(tris.size)
    me.loops.foreach_set("vertex_index", tris.ravel())
    me.polygons.add(len(tris))
    me.polygons.foreach_set("loop_start", np.arange(0, tris.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate(verbose=False)

    u = (verts[:, 0] - xmin) / (xmax - xmin)
    v = (verts[:, 1] - ymin) / (ymax - ymin)
    # glTF stores v' = 1 - v_blender. We want the GLB (and three.js) to hold v = 1 at north,
    # so the Blender-side UV is flipped here and flipped back by the exporter.
    uv_vert = np.stack([u, 1.0 - v], 1).astype(np.float32)
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", uv_vert[tris.ravel()].ravel())
    me.shade_smooth()
    obj = bpy.data.objects.new(name, me)
    return obj, len(tris)


def export_meshes(x, y, z):
    # Called on an empty factory scene (see main), so the scene holds only the mesh being exported.
    scene = bpy.context.scene
    for tier, (cols, rows) in MESHES.items():
        obj, ntri = build_mesh(f"terrain_{tier}", x, y, z, cols, rows)
        assert ntri <= TRI_CAP[tier], f"{tier}: {ntri} tris"
        assert len(scene.objects) == 0, [o.name for o in scene.objects]
        scene.collection.objects.link(obj)
        out = ASSETS / f"terrain_{tier}.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(out),
            export_format="GLB",
            use_selection=False,
            export_yup=True,
            export_apply=False,
            export_materials="NONE",
            export_texcoords=True,
            export_normals=True,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=10,
            export_draco_position_quantization=16,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=14,
        )
        log(f"{out.name}: {cols}x{rows} verts, {ntri} tris, {out.stat().st_size / 1e6:.2f} MB")
        bpy.data.objects.remove(obj)


def verify_uv_orientation(path):
    """Re-import the GLB and check that the importer's UV (Blender space) has v = 0 at the north edge,
    i.e. the stored glTF v is 1 at north."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    assert len(meshes) == 1, f"{path.name}: expected 1 mesh, got {[o.name for o in meshes]}"
    obj = meshes[0]
    me = obj.data
    n = len(me.loops)
    uv = np.empty(n * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    vi = np.empty(n, np.int32)
    me.loops.foreach_get("vertex_index", vi)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = (np.array(obj.matrix_world)[:3, :3] @ co.reshape(-1, 3).T).T
    north = co[vi, 1]
    uv = uv.reshape(-1, 2)
    v_gltf = 1 - uv[:, 1]
    k = np.argmax(north)
    s = np.argmin(north)
    log(f"verify {path.name}: glTF v at north edge {v_gltf[k]:.3f}, south edge {v_gltf[s]:.3f}")
    for o in new:
        bpy.data.objects.remove(o)
    assert v_gltf[k] > 0.999 and v_gltf[s] < 0.001, "UV v orientation wrong"


# ---------------------------------------------------------------- colour bake

def find_zone_mix(nt):
    attr = next(n for n in nt.nodes if n.type == "ATTRIBUTE" and n.attribute_name == "zone")
    frontier = [attr]
    seen = set()
    while frontier:
        node = frontier.pop(0)
        for link in nt.links:
            if link.from_node == node and link.to_node.name not in seen:
                seen.add(link.to_node.name)
                if link.to_node.type == "MIX" and link.to_socket.name == "Factor":
                    return attr, link.to_node, link.to_socket
                frontier.append(link.to_node)
    raise RuntimeError("zone Mix node not found")


def setup_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
    log("devices:", [(d.name, d.type, d.use) for d in prefs.devices])


def bake_color(x, y):
    scene = bpy.context.scene
    assert scene.name == "GMC_Relief", scene.name
    scene.frame_set(3)
    keep = {"GMC_Terrain", "GMC_Sun"}
    for o in scene.objects:
        if o.name not in keep:
            o.hide_render = True
    for cname in ("Cards_F1", "Cards_F2", "Cards_F4", "GMC_CloudCards"):
        if cname in bpy.data.collections:
            bpy.data.collections[cname].hide_render = True

    mat = bpy.data.materials["GMC_Plaster"]
    nt = mat.node_tree
    attr, mix, factor = find_zone_mix(nt)
    for link in list(nt.links):
        if link.from_node == attr or link.to_socket == factor:
            nt.links.remove(link)
    factor.default_value = 0.0
    f4 = nt.nodes["F4"]
    f4.outputs[0].default_value = 0.0
    log(f"zone colouring disabled via {mix.name}; F4 = {f4.outputs[0].default_value}")

    xmin, xmax, ymax, ymin = float(x[0]), float(x[-1]), float(y[0]), float(y[-1])
    w, h = xmax - xmin, ymax - ymin
    cam_data = bpy.data.cameras.new("GMC_BakeCam")
    cam_data.type = "ORTHO"
    cam_data.sensor_fit = "HORIZONTAL"
    # Integer resolution cannot match the w:h aspect exactly (error < 0.35 px). Fit the frame to the
    # height and let the width fall a hair inside the extent, so terrain fills the frame edge to edge.
    cam_data.ortho_scale = min(w, h * BAKE_RES[0] / BAKE_RES[1])
    cam_data.clip_start = 0.1
    cam_data.clip_end = 500
    cam = bpy.data.objects.new("GMC_BakeCam", cam_data)
    cam.location = ((xmin + xmax) / 2, (ymin + ymax) / 2, 100.0)
    cam.rotation_euler = (0, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = BAKE_RES
    r.resolution_percentage = 100
    r.film_transparent = False
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "8"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    setup_gpu(scene)
    log(f"ortho cam {w:.3f} x {h:.3f} km at {tuple(round(c, 3) for c in cam.location)}, "
        f"ortho_scale {cam_data.ortho_scale:.4f}")
    out = BUILD / "color_full.png"
    r.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log("rendered", out)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    x, y, z = read_shaped_grid()
    log(f"grid x {x[0]:.3f}..{x[-1]:.3f}, y {y[0]:.3f}..{y[-1]:.3f}, z {z.min():.3f}..{z.max():.3f} km")
    np.save(BUILD / "shaped_z.npy", z.astype(np.float32))
    (BUILD / "extent.json").write_text(json.dumps(
        {"xmin": float(x[0]), "xmax": float(x[-1]), "ymin": float(y[-1]), "ymax": float(y[0]),
         "rows": GRID_ROWS, "cols": GRID_COLS}))
    if not SKIP_RENDER:
        bake_color(x, y)
    # Drop the relief scene entirely before building/exporting meshes.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    export_meshes(x, y, z)
    for tier in MESHES:
        verify_uv_orientation(ASSETS / f"terrain_{tier}.glb")


try:
    main()
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)
