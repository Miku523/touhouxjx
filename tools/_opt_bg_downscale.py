
# -*- coding: utf-8 -*-
"""moon 背景降分辨率实验（子像素精确模拟 stage.js compose + backing 1.25）。
用法: python tools/_opt_bg_downscale.py"""
import json, os, math
from io import BytesIO
from PIL import Image, ImageDraw
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src/art/gen/bg/moon.jpg')
CUR = os.path.join(ROOT, 'src/art/gen/bg/moon.webp')
OUT = os.path.join(ROOT, 'tools/_opt/downscale')
os.makedirs(OUT, exist_ok=True)

VIEW_W, VIEW_H = 1280, 720
OVER = 420
LAYER_W, LAYER_H = VIEW_W + OVER, VIEW_H
BACKING = 1.25
WIN_X_CSS = max(0, (LAYER_W - VIEW_W) // 2) - 12     # stage.js paint(): prog=0
DEV_W, DEV_H = int(round(VIEW_W * BACKING)), int(round(VIEW_H * BACKING))

src = Image.open(SRC).convert('RGB')
SW, SH = src.size
WIDTHS = [2048, 1792, 1700, 1600]
CANDS = [(w, int(round(SH * w / SW))) for w in WIDTHS]

def enc(im, q=82):
    b = BytesIO(); im.save(b, 'WEBP', quality=q, method=6, exact=True); return b.getvalue()

def compose_device(im):
    """返回 1600x900 设备像素的视口画面：cover -> 1700x720 层 -> backing 放大 -> 取窗口。"""
    s = max(LAYER_W / im.width, LAYER_H / im.height)
    iw, ih = im.width * s, im.height * s
    off_x, off_y = (LAYER_W - iw) / 2.0, (LAYER_H - ih) / 2.0
    k = s * BACKING
    a = 1.0 / k
    c = (WIN_X_CSS - off_x) / s
    f = (0 - off_y) / s
    return im.transform((DEV_W, DEV_H), Image.AFFINE, (a, 0, c, 0, a, f), resample=Image.BICUBIC)

def psnr(a, b):
    aa = np.asarray(a, dtype=np.float64); bb = np.asarray(b, dtype=np.float64)
    mse = float(np.mean((aa - bb) ** 2))
    return float('inf') if mse < 1e-12 else 10 * math.log10(255.0 * 255.0 / mse)

cur_bytes = os.path.getsize(CUR)
cur_dev = compose_device(Image.open(CUR).convert('RGB'))
print('source jpg %dx%d %dB | current webp %dB' % (SW, SH, os.path.getsize(SRC), cur_bytes))

rows = []
for w, h in CANDS:
    if (w, h) == (SW, SH):
        data = open(CUR, 'rb').read(); note = 'current'; fp = 'src/art/gen/bg/moon.webp'
    else:
        data = enc(src.resize((w, h), Image.LANCZOS)); note = 'downscale'
        fp = 'tools/_opt/downscale/moon_%dx%d_q82.webp' % (w, h)
        with open(os.path.join(ROOT, fp), 'wb') as f: f.write(data)
    dec = Image.open(BytesIO(data)).convert('RGB')
    dev = compose_device(dec)
    rows.append(dict(w=w, h=h, note=note, bytes=len(data), saved=cur_bytes - len(data),
                     saved_ratio=round((cur_bytes - len(data)) / cur_bytes, 4),
                     psnr=(round(psnr(cur_dev, dev), 2) if note != 'current' else 'inf'), file=fp))
    if note != 'current':
        dev.save(os.path.join(OUT, '_dev_%d.png' % w))

# 对比图
cand = Image.open(BytesIO(open(os.path.join(ROOT, rows[-1]['file']), 'rb').read())).convert('RGB')
cand_dev = compose_device(cand)
REGIONS = [('moon edge', (300, 40, 860, 460)), ('dark sky gradient', (260, 540, 820, 900))]
panels = []
for name, box in REGIONS:
    a = cur_dev.crop(box); b = cand_dev.crop(box)
    a2 = a.resize((a.width * 2, a.height * 2), Image.NEAREST)
    b2 = b.resize((b.width * 2, b.height * 2), Image.NEAREST)
    diff = Image.fromarray(np.clip(np.abs(np.asarray(a, dtype=np.int16) - np.asarray(b, dtype=np.int16)) * 8, 0, 255).astype(np.uint8))
    diff2 = diff.resize((diff.width * 2, diff.height * 2), Image.NEAREST)
    row = Image.new('RGB', (a2.width * 3 + 24, a2.height + 30), (24, 24, 28))
    row.paste(a2, (0, 30)); row.paste(b2, (a2.width + 12, 30)); row.paste(diff2, (a2.width * 2 + 12, 30))
    d = ImageDraw.Draw(row)
    for x, t in [(4, '2048 q82 current %dKB' % (cur_bytes // 1024)), (a2.width + 16, '1600 q82 %dKB' % (rows[-1]['bytes'] // 1024)), (a2.width * 2 + 16, 'diff x8')]:
        d.rectangle((x, 4, x + 7 * len(t) + 12, 26), fill=(0, 0, 0)); d.text((x + 6, 8), t, fill=(255, 255, 255))
    panels.append(row)
sw = max(p.width for p in panels); sh = 56 + sum(p.height + 12 for p in panels)
sheet = Image.new('RGB', (sw, sh), (18, 18, 22)); d = ImageDraw.Draw(sheet)
d.text((10, 8), 'moon.jpg -> WebP q82: 2048 current vs 1600 downscale  [stage.js compose @backing 1.25, device px, x2 zoom]', fill=(230, 230, 235))
d.text((10, 26), 'left current | middle 1600 | right |diff| x8', fill=(160, 160, 170))
y = 56
for p in panels: sheet.paste(p, (0, y)); y += p.height + 12
sheet.save(os.path.join(OUT, 'moon_2048_vs_1600_compare.png'))

summary = dict(source_jpg=[SW, SH, os.path.getsize(SRC)], current_webp_bytes=cur_bytes,
               compose=dict(layer=[LAYER_W, LAYER_H], backing=BACKING, device=[DEV_W, DEV_H], window_device=[DEV_W, DEV_H]),
               candidates=rows, compare_png='tools/_opt/downscale/moon_2048_vs_1600_compare.png')
with open(os.path.join(OUT, 'downscale_moon.json'), 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(json.dumps(summary, ensure_ascii=False, indent=1))
