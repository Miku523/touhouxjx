"""把妖梦立绘的发色改成原作银白。

Ark 的版权过滤会拦「silver hair + 这套衣服」的组合，所以发色在出图之后本地改：
只在中上部、绿色调、且足够亮的像素上做色相替换，黑色蝴蝶结保持原样。
用法：python tools/youmu_silver.py <in.png> <out.png>
"""
import sys
import numpy as np
from PIL import Image


def silver(src, dst, head=0.26):
    a = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    greenness = g - (r + b) / 2
    yy = np.arange(h)[:, None] / h
    lum = (np.max(a[:, :, :3], axis=2) + np.min(a[:, :, :3], axis=2)) / 2 / 255.0
    base = (greenness > 4) & (yy < head) & (a[:, :, 3] >= 250)
    strength = np.clip((lum - 0.14) / 0.10, 0, 1) * base
    value = np.clip(0.58 + 0.64 * lum, 0, 1)
    rgb = np.stack([value * 0.95, value * 1.0, value * 1.04], axis=2) * 255.0
    out = a.copy()
    s3 = strength[:, :, None]
    for c in range(3):
        out[:, :, c] = out[:, :, c] * (1 - s3[:, :, 0]) + rgb[:, :, c] * s3[:, :, 0]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)


if __name__ == '__main__':
    silver(sys.argv[1], sys.argv[2])
