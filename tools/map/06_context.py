"""Context terrain: a wide, low-detail, muted landscape around the slab (Masar-style two-tier fidelity),
so the map reads as part of a larger valley instead of a cut-out.

Usage: .venv/bin/python tools/map/06_context.py [--cell 350] [--margin-x 56000] [--margin-y 51000]

Outputs (models/map/):
  gmc_map_m2-context_v01_height.bin   Float32 little-endian heights in metres, already x1.5, row 0 = north
  gmc_map_m2-context_v01.png          muted land-cover albedo + alpha fade to the void (row 0 = north)
  gmc_map_m2-context_v01.json         grid size, cell, extent (map metres, three.js: x east, z south)
Under the slab footprint the heights are min-filtered and pushed down so the context never pokes through.
"""
import json, sys
from pathlib import Path
import numpy as np, tifffile
from pyproj import Transformer
from scipy.ndimage import map_coordinates, minimum_filter, uniform_filter, gaussian_filter, zoom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEM, LC, DATA, OUT = ROOT / "data/dem", ROOT / "data/landcover", ROOT / "data/map", ROOT / "models/map"
argv = sys.argv[1:]
def arg(n, d): return float(argv[argv.index(n) + 1]) if n in argv else d
CELL = arg("--cell", 350.0)
EXAG = 1.5
meta = json.loads((DATA / "map_meta.json").read_text())
ox, oy = meta["origin_utm46n"]
xmin, ymin, xmax, ymax = meta["utm_bounds"]
HW, HH = (xmax - xmin) / 2, (ymax - ymin) / 2                 # slab half extents (m)
AX, AY = HW + arg("--margin-x", 56000.0), HH + arg("--margin-y", 51000.0)
nx, ny = int(2 * AX / CELL) + 1, int(2 * AY / CELL) + 1
to_ll = Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)

# ---------------- heights: 30 m mosaic -> mean over the cell (and min under the slab)
tiles = {}
for f in DEM.glob("cop30_N*_E*.tif"):
    p = f.stem.split("_"); tiles[(int(p[1][1:]), int(p[3][1:]))] = f
lats, lons = sorted({k[0] for k in tiles}), sorted({k[1] for k in tiles})
n = 3600
mos = np.zeros((len(lats) * n, len(lons) * n), np.float32)
for (la, lo), f in tiles.items():
    r = (lats[-1] - la) * n; c = (lo - lons[0]) * n
    mos[r:r + n, c:c + n] = tifffile.imread(f)
west, north, step = lons[0], lats[-1] + 1, 1.0 / n
print("mosaic", mos.shape, "lon", west, "->", lons[-1] + 1, "lat", lats[0], "->", north)
k = max(1, int(round(CELL / 30)))
mean_ = uniform_filter(mos, size=k)
min_ = minimum_filter(mos, size=k * 3)

xs = -AX + np.arange(nx) * CELL; zs = -AY + np.arange(ny) * CELL           # map metres; z = south
X, Z = np.meshgrid(xs, zs)
lon, lat = to_ll.transform((X + ox).ravel(), (oy - Z).ravel())
col = (np.asarray(lon) - west) / step - .5; row = (north - np.asarray(lat)) / step - .5
hm = map_coordinates(mean_, [row, col], order=1, mode="nearest").reshape(ny, nx)
hn = map_coordinates(min_, [row, col], order=1, mode="nearest").reshape(ny, nx)
# rounded-rect distance from the slab (negative inside)
CR = 3000.0
qx, qz = np.abs(X) - (HW - CR), np.abs(Z) - (HH - CR)
sd = np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0) - CR
# under the slab: a lower envelope so the context never pokes through; outside: the real mean surface.
# Meet the slab edge closely (small drop, short ramp) so the join reads as a soft lip, not a step.
inside = np.clip(1 - sd / 700.0, 0, 1)                                    # 1 inside, back to the mean within 700 m
h = hm * (1 - inside) + (np.minimum(hn, hm) - 8.0) * inside
h = (h * EXAG).astype("<f4")
OUT.mkdir(parents=True, exist_ok=True)
h.tofile(OUT / "gmc_map_m2-context_v01_height.bin")
print("grid", nx, "x", ny, "=", nx * ny, "verts", round(nx * ny * 4 / 1e6, 1), "MB")
del mos, mean_, min_

# ---------------- muted land-cover albedo + alpha fade (4096 wide)
TW = 4096; TH = round(TW * (2 * AY) / (2 * AX))
tx = -AX + (np.arange(TW) + .5) * (2 * AX / TW); tz = -AY + (np.arange(TH) + .5) * (2 * AY / TH)
TX, TZ = np.meshgrid(tx, tz)
lon, lat = to_ll.transform((TX + ox).ravel(), (oy - TZ).ravel())
lon = np.asarray(lon).reshape(TH, TW); lat = np.asarray(lat).reshape(TH, TW)
lc = np.zeros((TH, TW), np.uint8)
for f in sorted(LC.glob("wc2021_N*E*.tif")):
    code = f.stem.split("_")[1]; la0, lo0 = int(code[1:3]), int(code[4:7])
    m = (lat >= la0) & (lat < la0 + 3) & (lon >= lo0) & (lon < lo0 + 3)
    if not m.any(): continue
    with tifffile.TiffFile(f) as t:
        a = t.pages[2].asarray() if len(t.pages) > 2 else t.pages[0].asarray()    # 40 m overview is plenty here
    nn = a.shape[0]; st = 3.0 / nn
    lc[m] = a[np.clip(((la0 + 3 - lat[m]) / st).astype(int), 0, nn - 1), np.clip(((lon[m] - lo0) / st).astype(int), 0, nn - 1)]
    del a
print("landcover classes", np.unique(lc).tolist())

def hexc(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255
PAL = {10: "#2F4A38", 20: "#56703F", 30: "#6E8A4C", 40: "#A9B865", 50: "#CFC8BB", 60: "#B8B0A2", 80: "#2C5560", 90: "#5E7F86", 0: "#2F4A38"}
alb = np.tile(hexc(PAL[10]), (TH, TW, 1))
for c, hx in PAL.items():
    alb[lc == c] = hexc(hx)
alb = np.stack([gaussian_filter(alb[..., i], 1.0) for i in range(3)], -1)
# mute: desaturate 55 % and pull toward umber, so the slab stays the hero (design.md §1.1 two-tier fidelity)
lum = (alb[..., 0] * .2126 + alb[..., 1] * .7152 + alb[..., 2] * .0722)[..., None]
alb = alb * .6 + lum * .4            # keep the slab's hues, just greyer
alb = alb * .72                         # and darker; the experience can lift or drop it (Surround tone)
# alpha: superellipse fade into the void, from 62 % to 100 % of the extent
d = ((np.abs(TX) / AX) ** 4 + (np.abs(TZ) / AY) ** 4) ** .25
alpha = 1 - np.clip((d - .62) / .38, 0, 1) ** 1.6
alpha = alpha * alpha * (3 - 2 * alpha)
rgba = np.dstack([np.clip(alb, 0, 1), alpha]) * 255 + .5
Image.fromarray(rgba.astype(np.uint8), "RGBA").save(OUT / "gmc_map_m2-context_v01.png", optimize=True)

(OUT / "gmc_map_m2-context_v01.json").write_text(json.dumps(dict(
    nx=nx, ny=ny, cell=CELL, x0=-AX, z0=-AY, exag=EXAG, slab_half=[HW, HH],
    height="gmc_map_m2-context_v01_height.bin (Float32 LE, row 0 = north, metres x exag)",
    texture="gmc_map_m2-context_v01.png (RGBA, row 0 = north, load with flipY=false)",
    sources="Copernicus GLO-30 (mean over cell; min-filtered under the slab), ESA WorldCover 2021 (muted)"), indent=2))
print("texture", TW, "x", TH, round((OUT / "gmc_map_m2-context_v01.png").stat().st_size / 1e6, 1), "MB")
