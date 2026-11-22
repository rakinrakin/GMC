"""M1 step 1: Copernicus GLO-30 tiles -> UTM 46N heightmap for the GMC map.

Usage: .venv/bin/python tools/map/01_dem_prep.py [--overview]
  --overview  writes a wide hillshade PNG (lat/lon) to check the extent before cropping.

Outputs (data/map/):
  height_utm.npy      float32 metres, row 0 = north, col 0 = west, CELL m spacing
  height_utm16.png    16-bit heightmap, 0..65535 = HMIN..HMAX (see map_meta.json)
  hillshade.png       8-bit review image
  map_meta.json       extent, UTM origin, cell size, height range
"""
import json, sys
from pathlib import Path
import numpy as np, tifffile
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEM = ROOT / "data/dem"
OUT = ROOT / "data/map"; OUT.mkdir(parents=True, exist_ok=True)

# ---- agreed extent (approximate GMC, option A) -------------------------------
LON0, LON1, LAT0, LAT1 = 89.80, 90.80, 26.74, 27.14   # lon/lat box to sample from
CELL = 30.0                                             # metres per output cell

def load_mosaic():
    tiles = {}
    for f in DEM.glob("cop30_N*_E*.tif"):
        p = f.stem.split("_")
        lat, lon = int(p[1][1:]), int(p[3][1:])
        a = tifffile.imread(f).astype(np.float32)
        tiles[(lat, lon)] = a
    lats = sorted({k[0] for k in tiles}); lons = sorted({k[1] for k in tiles})
    n = next(iter(tiles.values())).shape[0]
    rows = []
    for lat in reversed(lats):                 # north first
        rows.append(np.concatenate([tiles[(lat, lon)] for lon in lons], axis=1))
    mosaic = np.concatenate(rows, axis=0)
    # pixel-is-area: upper-left corner of the mosaic = (lons[0], lats[-1]+1)
    return mosaic, lons[0], lats[-1] + 1, 1.0 / n

def sample_lonlat(mosaic, west, north, step, lon, lat):
    col = (lon - west) / step - 0.5
    row = (north - lat) / step - 0.5
    return map_coordinates(mosaic, [row, col], order=1, mode="nearest")

def hillshade(h, cell, az=315, alt=40, z=1.5):
    gy, gx = np.gradient(h * z, cell)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, e = np.radians(az), np.radians(alt)
    s = np.sin(e) * np.sin(slope) + np.cos(e) * np.cos(slope) * np.cos(a - aspect)
    return np.clip(s, 0, 1)

def main():
    mosaic, west, north, step = load_mosaic()
    print("mosaic", mosaic.shape, "west", west, "north", north, "range", mosaic.min(), mosaic.max())

    if "--overview" in sys.argv:
        s = 4
        sub = mosaic[::s, ::s]
        hs = hillshade(sub, 30 * s)
        hn = (sub - sub.min()) / (np.ptp(sub) + 1e-6)
        rgb = np.stack([hs * (0.5 + 0.5 * hn)] * 3, -1)
        rgb[sub < 1] = [0.1, 0.2, 0.4]
        Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT / "overview_lonlat.png")
        print("wrote overview", sub.shape)
        return

    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32646", always_xy=True)
    to_ll = Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)
    cx, cy = (LON0 + LON1) / 2, (LAT0 + LAT1) / 2
    # UTM bounds = box inscribed in the lon/lat box
    xs, ys = to_utm.transform([LON0, LON1, LON0, LON1], [LAT0, LAT0, LAT1, LAT1])
    xmin, xmax = max(xs[0], xs[2]), min(xs[1], xs[3])
    ymin, ymax = max(ys[0], ys[1]), min(ys[2], ys[3])
    nx = int((xmax - xmin) // CELL) + 1
    ny = int((ymax - ymin) // CELL) + 1
    gx = xmin + np.arange(nx) * CELL
    gy = ymax - np.arange(ny) * CELL
    X, Y = np.meshgrid(gx, gy)
    lon, lat = to_ll.transform(X.ravel(), Y.ravel())
    h = sample_lonlat(mosaic, west, north, step, np.asarray(lon), np.asarray(lat)).reshape(ny, nx).astype(np.float32)
    print("utm grid", h.shape, f"{(nx-1)*CELL/1000:.1f} x {(ny-1)*CELL/1000:.1f} km", "h", h.min(), h.max())

    np.save(OUT / "height_utm.npy", h)
    hmin, hmax = float(np.floor(h.min())), float(np.ceil(h.max()))
    q = np.round((h - hmin) / (hmax - hmin) * 65535).astype(np.uint16)
    Image.fromarray(q).save(OUT / "height_utm16.png")
    hs = hillshade(h, CELL)
    Image.fromarray((hs * 255).astype(np.uint8)).save(OUT / "hillshade.png")
    ox, oy = (xmin + xmax) / 2, (ymin + ymax) / 2
    meta = dict(source="Copernicus GLO-30 DEM (ESA), AWS open data", crs="EPSG:32646",
                lonlat_box=[LON0, LAT0, LON1, LAT1], utm_bounds=[xmin, ymin, xmax, ymax],
                origin_utm46n=[ox, oy], origin_lonlat=list(to_ll.transform(ox, oy)),
                cell_m=CELL, shape=[ny, nx], hmin=hmin, hmax=hmax,
                note="Extent is approximate GMC (option A); not the official boundary.")
    (OUT / "map_meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))

if __name__ == "__main__":
    main()
