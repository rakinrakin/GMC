"""M1: object-space normal map from the full 30 m (carved) heightmap, for the web terrain.

Usage: .venv/bin/python tools/map/05_normalmap.py [--width 4096]
Output: models/map/gmc_map_m1-terrain_v01_normal_os.png
  three.js object space (glTF / Y-up): R = +X east, G = +Y up, B = +Z south. Row 0 = north (load with flipY = false).
  Use with material.normalMapType = THREE.ObjectSpaceNormalMap.
"""
import json, sys
from pathlib import Path
import numpy as np
from scipy.ndimage import zoom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]; DATA = ROOT / "data/map"
argv = sys.argv[1:]
WIDTH = int(argv[argv.index("--width") + 1]) if "--width" in argv else 4096
EXAG = 1.5
meta = json.loads((DATA / "map_meta.json").read_text())
src = DATA / ("height_carved.npy" if (DATA / "height_carved.npy").exists() else "height_utm.npy")
h = np.load(src).astype(np.float64) * EXAG
cell = meta["cell_m"]
gn, ge = np.gradient(h, cell)            # rows go south: d/drow = -d/dnorth
fn = -gn                                  # dh/dnorth
fx = ge                                   # dh/deast
n = np.stack([-fx, np.ones_like(h), fn], -1)   # (x east, y up, z south): dz = -dnorth -> -df/dz = +fn
n /= np.linalg.norm(n, axis=-1, keepdims=True)
H = round(WIDTH * h.shape[0] / h.shape[1])
n = zoom(n, (H / h.shape[0], WIDTH / h.shape[1], 1), order=1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
rgb = ((n * 0.5 + 0.5) * 255 + 0.5).clip(0, 255).astype(np.uint8)
out = ROOT / "models/map/gmc_map_m1-terrain_v01_normal_os.png"
Image.fromarray(rgb).save(out, optimize=True)
print(out, rgb.shape, round(out.stat().st_size / 1e6, 1), "MB")
