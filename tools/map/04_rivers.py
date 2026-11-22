"""M2: river network from the DEM (+ WorldCover water for widths) and a carved heightmap.

Usage: .venv/bin/python tools/map/04_rivers.py [--amin 4.0]
  --amin   minimum upstream area in km² for a channel to be drawn (default 4)

Outputs (data/map/):
  rivers.json          polylines in map metres (x east, y north, origin = map centre):
                       [{"id", "pts": [[x, y, z_water_real_m, width_m], ...], "area_km2", "outlet"}]
  height_carved.npy    height_utm.npy with channels cut ~2.5 m below the water level
  rivers_preview.png   network over the hillshade
"""
import heapq, json, sys
from pathlib import Path
import numpy as np
from scipy.ndimage import minimum_filter, uniform_filter, gaussian_filter1d
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "data/map"
argv = sys.argv[1:]
AMIN = float(argv[argv.index("--amin") + 1]) if "--amin" in argv else 4.0
meta = json.loads((OUT / "map_meta.json").read_text())
h30 = np.load(OUT / "height_utm.npy").astype(np.float64)
ny30, nx30 = h30.shape; c30 = meta["cell_m"]
W, H = (nx30 - 1) * c30, (ny30 - 1) * c30

# ---- 60 m routing grid: valley bottoms (min-pool) so canopy doesn't block channels
S = 2; cell = c30 * S
hv = minimum_filter(h30, size=3)[::S, ::S]
ny, nx = hv.shape
N = ny * nx

# ---- priority-flood depression fill (Barnes 2014, epsilon variant); outlets = map edges
filled = hv.copy().ravel()
done = np.zeros(N, bool)
pq = []
edge = np.zeros((ny, nx), bool); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
for i in np.flatnonzero(edge.ravel()):
    heapq.heappush(pq, (filled[i], int(i))); done[i] = True
OFF = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
EPS = 1e-3
while pq:
    z, i = heapq.heappop(pq)
    r, c = divmod(i, nx)
    for dr, dc in OFF:
        rr, cc = r + dr, c + dc
        if 0 <= rr < ny and 0 <= cc < nx:
            j = rr * nx + cc
            if not done[j]:
                done[j] = True
                if filled[j] <= z:
                    filled[j] = z + EPS
                heapq.heappush(pq, (filled[j], j))
F = filled.reshape(ny, nx)
print("filled", F.shape)

# ---- D8 receivers
pad = np.pad(F, 1, constant_values=np.inf)
best = np.zeros((ny, nx)); rcv = -np.ones((ny, nx), np.int64)
rows, cols = np.mgrid[0:ny, 0:nx]
for dr, dc in OFF:
    nb = pad[1 + dr:1 + dr + ny, 1 + dc:1 + dc + nx]
    drop = (F - nb) / (np.hypot(dr, dc) * cell)
    better = drop > best
    best = np.where(better, drop, best)
    rcv = np.where(better, (rows + dr) * nx + (cols + dc), rcv)
rcv = rcv.ravel()

# ---- flow accumulation (cells), highest first
order = np.argsort(-filled, kind="stable")
acc = np.ones(N)
for i in order:
    j = rcv[i]
    if j >= 0:
        acc[j] += acc[i]
area_km2 = acc * cell * cell / 1e6
# on the flat plain the surface model is canopy noise: require 3x the catchment there
stream = area_km2 >= np.where(hv.ravel() < 350, 3 * AMIN, AMIN)
print("stream cells", int(stream.sum()))

# ---- WorldCover water width estimate on the 60 m grid
lc = np.load(OUT / "landcover_utm.npy")
water15 = (lc == 80).astype(np.float64)
win = 9                                              # 9 x 15 m = 135 m window
frac = uniform_filter(water15, size=win)             # fraction of water in the window
ww15 = frac * win * 15.0                             # ~ water width crossing the window (m)
# sample 15 m -> 60 m grid (nearest)
ry = np.clip((np.arange(ny) * cell / 15.0).round().astype(int), 0, lc.shape[0] - 1)
rx = np.clip((np.arange(nx) * cell / 15.0).round().astype(int), 0, lc.shape[1] - 1)
wwc = ww15[np.ix_(ry, rx)].ravel()

# ---- trace polylines: from each source down to a junction or the edge
up_count = np.zeros(N, int)
sidx = np.flatnonzero(stream)
for i in sidx:
    j = rcv[i]
    if j >= 0 and stream[j]:
        up_count[j] += 1
sources = sidx[up_count[sidx] == 0]
# trace main stems first: sources whose outlet drains the biggest area
def outlet_of(i):
    while rcv[i] >= 0 and stream[rcv[i]]:
        i = rcv[i]
    return i
src_out = np.array([outlet_of(s) for s in sources])
sources = sources[np.argsort(-area_km2[src_out])]

zlevel = np.full(N, np.nan)              # water level per stream cell (real metres)
visited = np.zeros(N, bool)
lines = []
for s in sources:
    path = [s]; i = s
    visited[s] = True
    while True:
        j = rcv[i]
        if j < 0 or not stream[j]:
            break
        path.append(j)
        if visited[j]:
            break
        visited[j] = True; i = j
    lines.append(path)

# water level: running minimum downstream along the main stems first, tributaries clamp to the junction
for path in lines:
    z = None
    for k, i in enumerate(path):
        v = hv.ravel()[i]
        if not np.isnan(zlevel[i]):          # junction with an already-levelled channel
            if z is not None:
                z = max(z, zlevel[i])
            break
        z = v if z is None else min(z, v)
        zlevel[i] = z

def cell_xy(i):
    r, c = divmod(i, nx)
    return -W / 2 + c * cell, H / 2 - r * cell

out = []
for n_, path in enumerate(lines):
    if len(path) < 3:
        continue
    xy = np.array([cell_xy(i) for i in path], float)
    a = area_km2[path]
    z = np.array([zlevel[i] for i in path]); z = np.where(np.isnan(z), hv.ravel()[path], z)
    w_area = np.maximum(30.0, 9.0 * np.sqrt(a))
    w = np.maximum(w_area, np.minimum(wwc[path] * 0.9, 260.0))
    w = np.minimum(w, 260.0)
    # resample along the path at ~30 m, then smooth the planform (diorama, not pixel staircase)
    d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(xy, axis=0).T))])
    L = d[-1]
    if L < 300:
        continue
    t = np.linspace(0, L, max(int(L / 30), 4))
    xs, ys = np.interp(t, d, xy[:, 0]), np.interp(t, d, xy[:, 1])
    zs, ws, As = np.interp(t, d, z), np.interp(t, d, w), np.interp(t, d, a)
    sig = 2.5
    xs_s, ys_s = gaussian_filter1d(xs, sig, mode="nearest"), gaussian_filter1d(ys, sig, mode="nearest")
    xs_s[0], ys_s[0], xs_s[-1], ys_s[-1] = xs[0], ys[0], xs[-1], ys[-1]     # keep junctions joined
    ws = gaussian_filter1d(ws, 4, mode="nearest")
    zs = np.minimum.accumulate(zs)                                            # never flows uphill
    # taper the source so channels fade in, not start blunt
    ws *= np.clip(t / 400.0, 0.35, 1.0)
    out.append(dict(id=f"river_{len(out):03d}", area_km2=round(float(As.max()), 2),
                    outlet=bool(rcv[path[-1]] < 0 or not stream[rcv[path[-1]]]),
                    pts=np.round(np.stack([xs_s, ys_s, zs, ws], -1), 2).tolist()))
print("polylines", len(out), "max area km2", max(o["area_km2"] for o in out))

# ---- carve: lower the 30 m heights under each channel to ~2.5 m below the water level
P = np.concatenate([np.array(o["pts"]) for o in out])
tree = cKDTree(P[:, :2])
X30, Y30 = np.meshgrid(-W / 2 + np.arange(nx30) * c30, H / 2 - np.arange(ny30) * c30)
G = np.stack([X30.ravel(), Y30.ravel()], -1)
dist, idx = tree.query(G, distance_upper_bound=float(P[:, 3].max()) / 2 + 45)
ok = np.isfinite(dist)
half = P[idx[ok], 3] / 2
inner = dist[ok] <= half + 15                    # channel + one grid cell so the notch is visible
target = P[idx[ok], 2] - 2.5
hc = h30.ravel().copy()
sel = np.flatnonzero(ok)[inner]
hc[sel] = np.minimum(hc[sel], target[inner])
# soft bank: cells just outside the channel come down half way
bank = (~inner) & (dist[ok] <= half + 45)
selb = np.flatnonzero(ok)[bank]
hc[selb] = np.minimum(hc[selb], 0.5 * (hc[selb] + P[idx[ok][bank], 2] + 1.0))
hc = hc.reshape(ny30, nx30).astype(np.float32)
np.save(OUT / "height_carved.npy", hc)
print("carved cells", len(sel), "bank cells", len(selb))

(OUT / "rivers.json").write_text(json.dumps(dict(
    source="Flow routing on Copernicus GLO-30 (60 m, priority-flood + D8); widths from upstream area and ESA WorldCover water",
    amin_km2=AMIN, coords="map metres: x east, y north, origin = map centre; z = real water level (m, before exaggeration)",
    rivers=out)))

# ---- preview
hs = np.array(Image.open(OUT / "hillshade.png").convert("RGB")).astype(np.float32) * 0.55
im = Image.fromarray(hs.astype(np.uint8)); dr = ImageDraw.Draw(im)
for o in out:
    p = np.array(o["pts"])
    col = (p[:, 0] + W / 2) / c30; row = (H / 2 - p[:, 1]) / c30
    wpx = max(1, int(np.median(p[:, 3]) / c30))
    dr.line(list(zip(col, row)), fill=(90, 190, 240), width=wpx)
im.resize((im.width // 2, im.height // 2)).save(OUT / "rivers_preview.png")
outlets_s = sum(1 for o in out if o["outlet"] and o["pts"][-1][1] < -H / 2 + 200)
print("channels leaving the south edge:", outlets_s)
