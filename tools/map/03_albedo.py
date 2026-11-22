"""M1 step 3: paint the terrain albedo + masks from land cover, using design.md §2 tokens.

Usage: .venv/bin/python tools/map/03_albedo.py
Outputs (data/map/, all on the 15 m land-cover grid, row 0 = north):
  terrain_albedo.png   sRGB albedo (land classes, field patchwork, canopy variation)
  terrain_water.png    8-bit mask: 255 = open water (drives the glossy water response)
  terrain_gravel.png   8-bit mask: 255 = braided gravel bed
"""
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import zoom, gaussian_filter, binary_opening
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "data/map"
meta = json.loads((OUT / "map_meta.json").read_text())
lc = np.load(OUT / "landcover_utm.npy")
h30 = np.load(OUT / "height_utm.npy")
ny, nx = lc.shape
cell = meta["landcover_cell_m"]
h = zoom(h30, (ny / h30.shape[0], nx / h30.shape[1]), order=1)[:ny, :nx]

def hexc(s):
    s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255

T = {k: hexc(v) for k, v in dict(
    forest="#2F4A38", canopy_mid="#3E5A3A", canopy_light="#6E8A4C", shrub="#56703F",
    paddy_young="#A9B865", paddy_gold="#C8B46A", paddy_water="#5E7F86", river="#2C5560",
    gravel="#B8B0A2", bare_slope="#8C7A62", ridge="#9A9188", built="#CFC8BB", conifer="#34483D",
    bund="#8C8A5A").items()}

rng = np.random.default_rng(1337)
def fbm(shape, scale_px, octaves=4):
    """Smooth value noise in [-1, 1], feature size ~scale_px."""
    out = np.zeros(shape, np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(scale_px / (2 ** o), 1.0)
        g = rng.standard_normal((int(shape[0] / s) + 3, int(shape[1] / s) + 3)).astype(np.float32)
        up = zoom(g, (shape[0] / (g.shape[0] - 2), shape[1] / (g.shape[1] - 2)), order=3)[:shape[0], :shape[1]]
        out += amp * up; tot += amp; amp *= 0.5
    out /= tot
    return np.clip(out / (out.std() * 2.5 + 1e-6), -1, 1)

def lerp(a, b, t): return a + (b - a) * t[..., None]

# terrain derivatives
gy, gx = np.gradient(h, cell)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))

# --- forest: two-tone canopy, cooler conifer upslope, crown-scale grain -------
n_big = fbm((ny, nx), 40) * 0.5 + 0.5           # ~600 m patches
n_crown = rng.standard_normal((ny, nx)).astype(np.float32)
n_crown = gaussian_filter(n_crown, 0.8); n_crown /= n_crown.std() * 3
forest = lerp(T["forest"][None, None], T["canopy_mid"][None, None], n_big)
up = np.clip((h - 1700) / 900, 0, 1)
forest = lerp(forest, T["conifer"][None, None] * np.ones_like(forest), up * 0.7)
steep = np.clip((slope - 32) / 15, 0, 1) * 0.25
forest = lerp(forest, T["bare_slope"][None, None] * np.ones_like(forest), steep)
# sun-facing (west/south-west) slopes a touch lighter, like canopy catching light
forest *= (1 + 0.05 * n_crown)[..., None]

# --- fields: patchwork of plots ~ 90 x 140 m, young / gold / flooded mix -------
yy, xx = np.mgrid[0:ny, 0:nx]
fw, fh = 140 / cell, 90 / cell
jitter = fbm((ny, nx), 25) * 2.0
ix = np.floor((xx + jitter) / fw).astype(np.int64); iy = np.floor((yy + jitter * 0.7) / fh).astype(np.int64)
hsh = ((ix * 73856093) ^ (iy * 19349663)) % 1000 / 1000.0
fields = np.where((hsh < 0.62)[..., None], T["paddy_young"], T["paddy_gold"])
fields = np.where((hsh > 0.965)[..., None], T["paddy_water"], fields)
fields = fields * (1 + 0.04 * (hsh[..., None] - 0.5))
# bunds: thin darker lines on plot edges
fx = ((xx + jitter) / fw) % 1; fyy = ((yy + jitter * 0.7) / fh) % 1
edge = (np.minimum(fx, 1 - fx) < 0.06) | (np.minimum(fyy, 1 - fyy) < 0.08)
fields = np.where(edge[..., None], lerp(fields, T["bund"][None, None] * np.ones_like(fields), np.full(edge.shape, .5, np.float32)), fields)

# --- assemble ----------------------------------------------------------------
alb = forest.copy()
def put(mask, col):
    global alb
    alb = np.where(mask[..., None], col, alb)

water = lc == 80
gravel = (lc == 60) & (h < 450)
put(lc == 20, np.broadcast_to(T["shrub"], alb.shape))
put(lc == 30, lerp(T["canopy_light"][None, None] * np.ones_like(alb), T["shrub"][None, None] * np.ones_like(alb), n_big * .5))
put(lc == 40, fields)
put(lc == 90, np.broadcast_to(T["paddy_water"], alb.shape))
put(lc == 50, np.broadcast_to(T["built"], alb.shape))
put((lc == 60) & ~gravel, np.broadcast_to(T["bare_slope"], alb.shape))
grav_col = lerp(T["gravel"][None, None] * np.ones_like(alb), T["ridge"][None, None] * np.ones_like(alb), fbm((ny, nx), 6) * .5 + .5)
put(gravel, grav_col)
put(water, np.broadcast_to(T["river"], alb.shape))
# high ridges (rare here): stony tint above 2600 m on exposed crests
put((h > 2600) & (slope < 25) & (lc != 10), np.broadcast_to(T["ridge"], alb.shape))

# soften class edges a little (diorama, not pixels); keep detail
alb = np.stack([gaussian_filter(alb[..., i], 0.6) for i in range(3)], -1)
# overall +-4% low-frequency lightness drift (design.md §2.3 rule 6)
alb *= (1 + 0.04 * fbm((ny, nx), 120))[..., None]
alb = np.clip(alb, 0.03, 0.93)

Image.fromarray((alb * 255 + .5).astype(np.uint8)).save(OUT / "terrain_albedo.png")
wm = gaussian_filter(binary_opening(water, iterations=0) if False else water.astype(np.float32), 0.7)
Image.fromarray((np.clip(wm, 0, 1) * 255).astype(np.uint8)).save(OUT / "terrain_water.png")
Image.fromarray((gaussian_filter(gravel.astype(np.float32), .7) * 255).astype(np.uint8)).save(OUT / "terrain_gravel.png")
Image.fromarray((alb[::4, ::4] * 255).astype(np.uint8)).save(OUT / "terrain_albedo_preview.png")
print("albedo", alb.shape, "water px", int(water.sum()), "gravel px", int(gravel.sum()))

# built-up mask (settlements): drives the DUSK lamp glow on the map
built = gaussian_filter((lc == 50).astype(np.float32), 0.8)
Image.fromarray((np.clip(built * 1.6, 0, 1) * 255).astype(np.uint8)).save(OUT / "terrain_built.png")
print("built px", int((lc == 50).sum()))
