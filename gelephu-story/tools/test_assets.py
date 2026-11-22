"""Asset pipeline checks. Run: python3 gelephu-story/tools/test_assets.py"""
import json
import re
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "public" / "assets"
DRACO = ROOT / "public" / "draco"

TEX = {"desktop": (4096, 2779), "mobile": (2048, 1390)}
TRI_CAP = {"desktop": 260_000, "mobile": 85_000}
ZONE_SIZE = (2048, 1390)
CLOUDS = [f"cloud_{c}_{v}.webp" for c in "abcde" for v in ("side", "top")]
SHARED = ["zones_id.png", "zones.json", "project_spire.webp", *CLOUDS]
DRACO_FILES = ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]
CORE_PT = (9.18, -7.77)


def per_tier(tier):
    sfx = "" if tier == "desktop" else "_mobile"
    return [f"terrain_{tier}.glb", f"terrain_color{sfx}.webp", f"terrain_normal{sfx}.webp"]


def read_glb_json(path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2, f"{path.name}: not GLB v2"
    clen, ctype = struct.unpack_from("<I4s", data, 12)
    assert ctype == b"JSON"
    return json.loads(data[20:20 + clen])


def glb_triangles(path):
    gj = read_glb_json(path)
    assert "KHR_draco_mesh_compression" in gj.get("extensionsUsed", []), f"{path.name}: not Draco"
    tris = 0
    for mesh in gj["meshes"]:
        for prim in mesh["primitives"]:
            assert "KHR_draco_mesh_compression" in prim.get("extensions", {}), f"{path.name}: prim not Draco"
            assert prim.get("mode", 4) == 4
            assert "TEXCOORD_0" in prim["attributes"], f"{path.name}: no UV0"
            tris += gj["accessors"][prim["indices"]]["count"] // 3
    return tris


def check_files():
    names = [n for t in TEX for n in per_tier(t)] + SHARED
    missing = [n for n in names if not (A / n).is_file()]
    missing += [f"draco/{n}" for n in DRACO_FILES if not (DRACO / n).is_file()]
    assert not missing, f"missing: {missing}"


def check_meshes():
    for tier, cap in TRI_CAP.items():
        tris = glb_triangles(A / f"terrain_{tier}.glb")
        print(f"  {tier} glb: {tris} tris (cap {cap})")
        assert 0 < tris <= cap, f"{tier}: {tris} tris > {cap}"


def check_textures():
    for tier, size in TEX.items():
        sfx = "" if tier == "desktop" else "_mobile"
        for kind in ("color", "normal"):
            im = Image.open(A / f"terrain_{kind}{sfx}.webp")
            assert im.size == size, f"terrain_{kind}{sfx}: {im.size} != {size}"
    for n in CLOUDS:
        im = Image.open(A / n)
        assert im.mode == "RGBA", f"{n}: no alpha"
        assert im.width <= 1024, f"{n}: {im.width} wide"
    assert Image.open(A / "project_spire.webp").width == 1942


def check_zones():
    im = Image.open(A / "zones_id.png")
    assert im.format == "PNG" and im.size == ZONE_SIZE, f"zones_id: {im.size}"
    import numpy as np
    px = np.asarray(im.convert("RGB"))
    assert (px[..., 1:] == 0).all(), "zones_id: G/B must be 0"
    png_ids = set(np.unique(px[..., 0]).tolist()) - {0}
    zones = json.loads((A / "zones.json").read_text())
    json_ids = {z["id"] for z in zones}
    assert png_ids == json_ids, f"png ids {sorted(png_ids)} != json ids {sorted(json_ids)}"
    assert sorted(json_ids) == list(range(1, len(zones) + 1)), "ids must be 1..N"
    areas = [z["areaKm2"] for z in sorted(zones, key=lambda z: z["id"])]
    assert areas == sorted(areas, reverse=True), "ids must follow descending area"
    cores = [z for z in zones if z.get("core") is True]
    assert len(cores) == 1, f"{len(cores)} core zones"
    cx, cy = cores[0]["centroidKm"]
    d = ((cx - CORE_PT[0]) ** 2 + (cy - CORE_PT[1]) ** 2) ** 0.5
    assert d <= 3, f"core centroid {cx:.2f},{cy:.2f} is {d:.2f} km from core point"
    print(f"  {len(zones)} zones, core id {cores[0]['id']}")
    return zones, cores[0]["id"]


def check_config(zones, core_id):
    src = (ROOT / "src" / "config.ts").read_text()
    block = src[src.index("zones: ["):]
    ids = [int(m) for m in re.findall(r"\bid:\s*(\d+)", block)]
    assert sorted(ids) == sorted(z["id"] for z in zones), f"config ids {ids} != zones.json"
    m = re.search(r"id:\s*%d,\s*name:\s*'([^']*)'" % core_id, block)
    assert m and m.group(1) == "Gelephu core", "core id must be named 'Gelephu core' in config.ts"


def check_budgets():
    draco = sum((DRACO / n).stat().st_size for n in ("draco_decoder.wasm", "draco_wasm_wrapper.js"))
    shared = sum((A / n).stat().st_size for n in SHARED) + draco
    for tier, cap in (("desktop", 9e6), ("mobile", 5e6)):
        total = shared + sum((A / n).stat().st_size for n in per_tier(tier))
        print(f"  {tier} total: {total / 1e6:.2f} MB (cap {cap / 1e6:.0f} MB)")
        assert total < cap, f"{tier} total {total} >= {cap}"


if __name__ == "__main__":
    check_files()
    check_meshes()
    check_textures()
    zones, core_id = check_zones()
    check_config(zones, core_id)
    check_budgets()
    print("ALL ASSET CHECKS PASSED")
