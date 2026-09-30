"""Track a flat sign panel through a frame sequence and cover a neighbouring panel with a plain lightbox.

Usage: python cover.py <config.json>
Config keys:
  raw      frame pattern, e.g. "draw/%04d.png"
  out      output dir
  n        frame count
  tpl      [x0, y0, x1, y1] tracking template (a rigid, textured panel) in frame 1
  quad     [[x, y] x4] panel to cover in frame 1 (TL, TR, BR, BL)
  color    [x0, y0, x1, y1] blank strip in frame 1 to sample the lightbox colour from
  search   max per-frame scale change (default 0.02)
  radius   search radius in downsampled px (default 14)
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

cfg = json.load(open(sys.argv[1]))
RAW, OUT, N = cfg["raw"], cfg["out"], cfg["n"]
DS = 2
os.makedirs(OUT, exist_ok=True)


def gray(i):
    im = Image.open(RAW % i).convert("L")
    return np.asarray(im.resize((im.width // DS, im.height // DS), Image.BILINEAR), dtype=np.float32)


def ncc_map(img, tpl):
    th, tw = tpl.shape
    t = tpl - tpl.mean()
    tn = np.sqrt((t * t).sum()) + 1e-6
    win = np.lib.stride_tricks.sliding_window_view(img, (th, tw))
    w = win - win.mean(axis=(2, 3), keepdims=True)
    return (w * t).sum(axis=(2, 3)) / (np.sqrt((w * w).sum(axis=(2, 3))) * tn + 1e-6)


x0, y0, x1, y1 = cfg["tpl"]
tpl_img = Image.open(RAW % 1).convert("L").crop((x0, y0, x1, y1))
W0, H0 = x1 - x0, y1 - y0
R = cfg.get("radius", 14)
steps = np.arange(-cfg.get("search", 0.02), cfg.get("search", 0.02) + 1e-9, 0.004)

track = {1: (float(x0), float(y0), 1.0, 1.0)}
x, y, s = float(x0), float(y0), 1.0
for i in range(2, N + 1):
    img = gray(i)
    best = None
    for d in steps:
        sc = s * (1 + d)
        tw, th = int(round(W0 * sc / DS)), int(round(H0 * sc / DS))
        if tw < 8 or th < 6:
            continue
        t = np.asarray(tpl_img.resize((tw, th), Image.BILINEAR), dtype=np.float32)
        px, py = x / DS, y / DS
        sx0, sy0 = int(max(0, px - R)), int(max(0, py - R))
        sx1, sy1 = int(min(img.shape[1], px + R + tw)), int(min(img.shape[0], py + R + th))
        sub = img[sy0:sy1, sx0:sx1]
        if sub.shape[0] < th or sub.shape[1] < tw:
            continue
        m = ncc_map(sub, t)
        k = np.unravel_index(np.argmax(m), m.shape)
        if best is None or m[k] > best[0]:
            best = (float(m[k]), (sx0 + k[1]) * DS, (sy0 + k[0]) * DS, sc)
    if best is None or best[0] < 0.5:
        print("lost at", i, best and round(best[0], 3))
        break
    score, x, y, s = best
    track[i] = (float(x), float(y), s, score)
    if i % 20 == 0:
        print(i, round(x), round(y), round(s, 3), round(score, 3), flush=True)

last = max(track)
if last < N:  # extrapolate the final motion so the sign stays covered as it leaves
    a, b = track[last - 4], track[last]
    v = [(b[k] - a[k]) / 4 for k in range(3)]
    for i in range(last + 1, N + 1):
        p = track[i - 1]
        track[i] = (p[0] + v[0], p[1] + v[1], p[2] + v[2], 0.0)

ORIGIN = np.array([x0, y0], dtype=float)
QUAD = np.array(cfg["quad"], dtype=float)
f1 = np.asarray(Image.open(RAW % 1).convert("RGB"), dtype=np.float32)
cx0, cy0, cx1, cy1 = cfg["color"]
col = f1[cy0:cy1, cx0:cx1].mean(axis=1)

painted = 0
for i in range(1, N + 1):
    src, dst = RAW % i, os.path.join(OUT, "%04d.png" % i)
    tx, ty, ts, _ = track[i]
    q = np.array([tx, ty]) + ts * (QUAD - ORIGIN)
    im = Image.open(src).convert("RGB")
    W, H = im.size
    if q[:, 1].min() > H or q[:, 0].max() < 0:
        shutil.copyfile(src, dst)
        continue
    qx0, qy0 = np.floor(q.min(axis=0)).astype(int)
    qx1, qy1 = np.ceil(q.max(axis=0)).astype(int)
    h, w = max(1, qy1 - qy0), max(1, qx1 - qx0)
    rows = np.linspace(0, len(col) - 1, h).astype(int)
    grad = col[rows][:, None, :].repeat(w, axis=1)
    yy = np.linspace(-1, 1, h)[:, None]
    xx = np.linspace(-1, 1, w)[None, :]
    grad *= (1 - 0.06 * (xx ** 2 + yy ** 2))[:, :, None]
    patch = Image.fromarray(np.clip(grad, 0, 255).astype(np.uint8))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in q], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    layer = Image.new("RGB", (W, H))
    layer.paste(patch, (qx0, qy0))
    Image.composite(layer, im, mask).save(dst)
    painted += 1
json.dump({k: v for k, v in track.items()}, open(os.path.join(OUT, "track.json"), "w"))
print("tracked", last, "of", N, "- painted", painted)
