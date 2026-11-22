"""M1 step 2: ESA WorldCover 2021 -> land-cover class raster on the map's UTM grid.

Usage: .venv/bin/python tools/map/02_landcover.py
Reads the 20 m overview (page 1) of each 3x3 degree tile, samples nearest-neighbour
onto a UTM 46N grid at LC_CELL metres covering exactly the same bounds as height_utm.npy.

Outputs (data/map/): landcover_utm.npy (uint8 WorldCover codes), landcover_preview.png
"""
import json
from pathlib import Path
import numpy as np, tifffile
from pyproj import Transformer
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LC = ROOT / "data/landcover"; OUT = ROOT / "data/map"
LC_CELL = 15.0

meta = json.loads((OUT / "map_meta.json").read_text())
xmin, ymin, xmax, ymax = meta["utm_bounds"]
nx = int(round((xmax - xmin) / LC_CELL)) + 1
ny = int(round((ymax - ymin) / LC_CELL)) + 1
gx = xmin + np.arange(nx) * LC_CELL
gy = ymax - np.arange(ny) * LC_CELL
X, Y = np.meshgrid(gx, gy)
lon, lat = Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True).transform(X.ravel(), Y.ravel())
lon = np.asarray(lon).reshape(ny, nx); lat = np.asarray(lat).reshape(ny, nx)
out = np.zeros((ny, nx), np.uint8)

for f in sorted(LC.glob("wc2021_N*E*.tif")):
    code = f.stem.split("_")[1]                  # e.g. N24E090
    lat0, lon0 = int(code[1:3]), int(code[4:7])
    m = (lat >= lat0) & (lat < lat0 + 3) & (lon >= lon0) & (lon < lon0 + 3)
    if not m.any():
        continue
    with tifffile.TiffFile(f) as t:
        page = t.pages[1] if len(t.pages) > 1 else t.pages[0]
        a = page.asarray()
    n = a.shape[0]; step = 3.0 / n
    r = np.clip(((lat0 + 3 - lat[m]) / step).astype(int), 0, n - 1)
    c = np.clip(((lon[m] - lon0) / step).astype(int), 0, n - 1)
    out[m] = a[r, c]
    print(f.name, a.shape, "cells", int(m.sum()))
    del a

np.save(OUT / "landcover_utm.npy", out)
vals, cnt = np.unique(out, return_counts=True)
print("classes", dict(zip(vals.tolist(), (cnt / cnt.sum()).round(4).tolist())))
pal = {0: (0, 0, 0), 10: (47, 74, 56), 20: (110, 120, 70), 30: (169, 184, 101), 40: (200, 180, 106),
       50: (217, 211, 200), 60: (184, 176, 162), 70: (255, 255, 255), 80: (44, 85, 96), 90: (94, 127, 134),
       95: (40, 80, 60), 100: (150, 150, 120)}
rgb = np.zeros(out.shape + (3,), np.uint8)
for k, v in pal.items():
    rgb[out == k] = v
Image.fromarray(rgb).resize((nx // 4, ny // 4), Image.NEAREST).save(OUT / "landcover_preview.png")
meta.update(landcover_cell_m=LC_CELL, landcover_shape=[ny, nx], landcover_source="ESA WorldCover 10m 2021 v200 (20 m overview)")
(OUT / "map_meta.json").write_text(json.dumps(meta, indent=2))
