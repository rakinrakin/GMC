"""Python half of the asset pipeline (run after export_assets.py):
  python3 gelephu-story/tools/build_maps.py

Reads  tools/.build/{shaped_z.npy, extent.json, color_full.png}  (from export_assets.py)
       <GMC>/relief-test/{terrain2.npz, clouds/, project_images/}
Writes public/assets/terrain_color[_mobile].webp, terrain_normal[_mobile].webp,
       zones_id.png, zones.json, cloud_*.webp, project_spire.webp
       public/draco/  (three.js Draco decoder)

Image convention (all maps): row 0 = north edge, column 0 = west edge; the image spans exactly the
grid extent x[0]..x[-1], y[-1]..y[0].
Normal map: world-up normal, RGB = (n + 1) / 2 with x = east, y = north, z = up.
zones_id.png: R = zone id (1..N), G = B = 0, background 0.
"""
import json
import os
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
ASSETS = ROOT / "public" / "assets"
DRACO_OUT = ROOT / "public" / "draco"
BUILD = TOOLS / ".build"
SRC = Path(os.environ.get("GMC_RELIEF_DIR", "/Users/rakin/Desktop/GMC/relief-test"))
DRACO_SRC = ROOT / "node_modules" / "three" / "examples" / "jsm" / "libs" / "draco" / "gltf"

TEX = {"": (4096, 2779), "_mobile": (2048, 1390)}
ZONE_SIZE = (2048, 1390)
MIN_AREA_KM2 = 0.5
MERGE_DIST_KM = 1.5
CORE_PT = (9.18, -7.77)
COLOR_Q = {"": 80, "_mobile": 82}
NORMAL_Q = {"": 82, "_mobile": 85}


def log(*a):
    print("[build_maps]", *a, flush=True)


def sample_positions(n_out, n_grid):
    """Fractional grid indices for output pixel centres, image edges = first/last grid sample."""
    return (np.arange(n_out) + 0.5) / n_out * (n_grid - 1)


# ---------------------------------------------------------------- colour

def build_color():
    src = Image.open(BUILD / "color_full.png").convert("RGB")
    assert src.size == TEX[""], f"color_full.png is {src.size}"
    for sfx, size in TEX.items():
        im = src if src.size == size else src.resize(size, Image.LANCZOS)
        out = ASSETS / f"terrain_color{sfx}.webp"
        im.save(out, "WEBP", quality=COLOR_Q[sfx], method=6)
        log(f"{out.name} {im.size} {out.stat().st_size / 1e6:.2f} MB")


# ---------------------------------------------------------------- normals

def grid_normals(z, dx, dy):
    """Central differences on the shaped heights (km). Rows run north -> south."""
    dzdx = np.empty_like(z)
    dzdx[:, 1:-1] = (z[:, 2:] - z[:, :-2]) / (2 * dx)
    dzdx[:, 0] = (z[:, 1] - z[:, 0]) / dx
    dzdx[:, -1] = (z[:, -1] - z[:, -2]) / dx
    dzdn = np.empty_like(z)  # d z / d north
    dzdn[1:-1] = (z[:-2] - z[2:]) / (2 * dy)
    dzdn[0] = (z[0] - z[1]) / dy
    dzdn[-1] = (z[-2] - z[-1]) / dy
    n = np.stack([-dzdx, -dzdn, np.ones_like(z)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def bilinear(a, fr, fc):
    r0 = np.clip(np.floor(fr).astype(int), 0, a.shape[0] - 2)
    c0 = np.clip(np.floor(fc).astype(int), 0, a.shape[1] - 2)
    tr = (fr - r0)[:, None, None]
    tc = (fc - c0)[None, :, None]
    R0, C0 = np.meshgrid(r0, c0, indexing="ij")
    return ((1 - tr) * (1 - tc) * a[R0, C0] + (1 - tr) * tc * a[R0, C0 + 1]
            + tr * (1 - tc) * a[R0 + 1, C0] + tr * tc * a[R0 + 1, C0 + 1])


def build_normals(z, ext):
    rows, cols = z.shape
    dx = (ext["xmax"] - ext["xmin"]) / (cols - 1)
    dy = (ext["ymax"] - ext["ymin"]) / (rows - 1)
    n = grid_normals(z.astype(np.float64), dx, dy).astype(np.float32)
    for sfx, (W, H) in TEX.items():
        m = bilinear(n, sample_positions(H, rows), sample_positions(W, cols))
        m /= np.linalg.norm(m, axis=-1, keepdims=True)
        rgb = np.clip(np.round((m * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
        out = ASSETS / f"terrain_normal{sfx}.webp"
        Image.fromarray(rgb).save(out, "WEBP", quality=NORMAL_Q[sfx], method=6)
        log(f"{out.name} {(W, H)} {out.stat().st_size / 1e6:.2f} MB")


# ---------------------------------------------------------------- zones

def components4(mask):
    lab = np.zeros(mask.shape, np.int32)
    H, W = mask.shape
    n = 0
    for r, c in zip(*np.nonzero(mask)):
        if lab[r, c]:
            continue
        n += 1
        lab[r, c] = n
        q = deque([(r, c)])
        while q:
            i, j = q.popleft()
            for a, b in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)):
                if 0 <= a < H and 0 <= b < W and mask[a, b] and not lab[a, b]:
                    lab[a, b] = n
                    q.append((a, b))
    return lab, n


def build_zones():
    d = np.load(SRC / "terrain2.npz")
    red = d["red"] > 0.5
    x = d["x"].astype(np.float64)
    y = d["y"].astype(np.float64)
    cell_km2 = (x[1] - x[0]) * (y[0] - y[1])
    lab, n = components4(red)
    counts = np.bincount(lab.ravel(), minlength=n + 1)
    big = [k for k in range(1, n + 1) if counts[k] * cell_km2 >= MIN_AREA_KM2]
    small = [k for k in range(1, n + 1) if counts[k] * cell_km2 < MIN_AREA_KM2]
    log(f"{n} components, {len(big)} >= {MIN_AREA_KM2} km2, {len(small)} smaller; cell {cell_km2:.5f} km2")

    big_r, big_c = np.nonzero(np.isin(lab, big))
    big_pts = np.stack([x[big_c], y[big_r]], 1)
    big_lab = lab[big_r, big_c]
    merged = dropped = 0
    out = lab.copy()
    for k in small:
        rr, cc = np.nonzero(lab == k)
        pts = np.stack([x[cc], y[rr]], 1)
        d2 = ((pts[:, None, :] - big_pts[None, :, :]) ** 2).sum(-1)
        i = np.unravel_index(np.argmin(d2), d2.shape)
        if np.sqrt(d2[i]) <= MERGE_DIST_KM:
            out[rr, cc] = big_lab[i[1]]
            merged += 1
        else:
            out[rr, cc] = 0
            dropped += 1
    log(f"merged {merged} small components, dropped {dropped}")

    # Renumber by descending area.
    counts = np.bincount(out.ravel(), minlength=n + 1)
    order = sorted(big, key=lambda k: -counts[k])
    remap = np.zeros(n + 1, np.int32)
    for new_id, k in enumerate(order, 1):
        remap[k] = new_id
    ids = remap[out]
    assert len(order) <= 255, "zone ids must fit in the R channel"

    # Core: the zone containing the core point (nearest zone pixel if the point falls just outside).
    cr = int(round((y[0] - CORE_PT[1]) / (y[0] - y[1])))
    cc = int(round((CORE_PT[0] - x[0]) / (x[1] - x[0])))
    core_id = int(ids[cr, cc])
    if core_id == 0:
        zr, zc = np.nonzero(ids)
        j = np.argmin((x[zc] - CORE_PT[0]) ** 2 + (y[zr] - CORE_PT[1]) ** 2)
        core_id = int(ids[zr[j], zc[j]])
        log(f"core point not on a zone pixel; nearest zone {core_id}")

    zones = []
    for zid in range(1, len(order) + 1):
        rr, cc2 = np.nonzero(ids == zid)
        z = {"id": zid, "areaKm2": round(float(len(rr) * cell_km2), 3),
             "centroidKm": [round(float(x[cc2].mean()), 3), round(float(y[rr].mean()), 3)]}
        if zid == core_id:
            z["core"] = True
        zones.append(z)
    (ASSETS / "zones.json").write_text(json.dumps(zones, indent=1) + "\n")

    W, H = ZONE_SIZE
    rows, cols = ids.shape
    ri = np.rint(sample_positions(H, rows)).astype(int)
    ci = np.rint(sample_positions(W, cols)).astype(int)
    r_ch = ids[np.ix_(ri, ci)].astype(np.uint8)
    rgb = np.zeros((H, W, 3), np.uint8)
    rgb[..., 0] = r_ch
    Image.fromarray(rgb).save(ASSETS / "zones_id.png", optimize=True)
    present = set(np.unique(r_ch).tolist()) - {0}
    assert present == set(range(1, len(order) + 1)), "a zone vanished in nearest sampling"
    log(f"{len(zones)} zones, core id {core_id}: {zones[core_id - 1]}")
    return zones


# ---------------------------------------------------------------- clouds, project image, draco

def build_clouds():
    for c in "abcde":
        for v in ("side", "top"):
            im = Image.open(SRC / "clouds" / f"cloud_{c}_{v}.png").convert("RGBA")
            l, t, r, b = im.getchannel("A").getbbox()
            pad = 8
            im = im.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, im.width), min(b + pad, im.height)))
            if im.width > 1024:
                im = im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS)
            out = ASSETS / f"cloud_{c}_{v}.webp"
            im.save(out, "WEBP", quality=85, alpha_quality=90, method=6)
            log(f"{out.name} {im.size} {out.stat().st_size / 1e3:.0f} kB")


def build_project():
    im = Image.open(SRC / "project_images" / "project_spire.png").convert("RGB")
    if im.width != 1942:
        im = im.resize((1942, round(im.height * 1942 / im.width)), Image.LANCZOS)
    out = ASSETS / "project_spire.webp"
    im.save(out, "WEBP", quality=82, method=6)
    log(f"{out.name} {im.size} {out.stat().st_size / 1e3:.0f} kB")


def copy_draco():
    DRACO_OUT.mkdir(parents=True, exist_ok=True)
    for n in ("draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"):
        shutil.copyfile(DRACO_SRC / n, DRACO_OUT / n)
    log("copied Draco decoder to", DRACO_OUT)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    ext = json.loads((BUILD / "extent.json").read_text())
    z = np.load(BUILD / "shaped_z.npy")
    build_color()
    build_normals(z, ext)
    build_zones()
    build_clouds()
    build_project()
    copy_draco()


if __name__ == "__main__":
    main()
