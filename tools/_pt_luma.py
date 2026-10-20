#!/usr/bin/env python3
"""背景明暗测量：截图中心区平均亮度（0-255）。

默认中心区 = 画面水平 30%-70%、垂直 25%-65%（512x288），
避开顶部 HUD 压暗带、底部地面与近景剪影。
亮度定义：L = 0.299R + 0.587G + 0.114B（sRGB 8bit，逐像素后取平均）。

用法：
  python tools/_pt_luma.py _pt/bg/*.png
  python tools/_pt_luma.py --box 0.3,0.25,0.7,0.65 --json _pt/bg/s1_p10.png
"""
import argparse
import json
import os
import sys

from PIL import Image

DEF_BOX = (0.30, 0.25, 0.70, 0.65)


def luma_stats(path, box):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    x0, y0, x1, y1 = box
    crop = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    px = list(crop.getdata())
    n = len(px)
    s = 0.0
    for r, g, b in px:
        s += 0.299 * r + 0.587 * g + 0.114 * b
    cmean = s / max(1, n)
    # 全画面平均，仅作参考
    fpx = list(im.getdata())
    fs = 0.0
    for r, g, b in fpx:
        fs += 0.299 * r + 0.587 * g + 0.114 * b
    fmean = fs / max(1, len(fpx))
    return {
        'file': os.path.basename(path),
        'size': [W, H],
        'center': round(cmean, 2),
        'full': round(fmean, 2),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--box', default=None, help='x0,y0,x1,y1 fractions')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    box = DEF_BOX
    if a.box:
        box = tuple(float(v) for v in a.box.split(','))
    rows = [luma_stats(p, box) for p in a.files if os.path.exists(p)]
    if a.json:
        print(json.dumps({'box': box, 'rows': rows}, ensure_ascii=False))
        return
    print('box=%s' % (box,))
    print('%-22s %6s %6s' % ('file', 'center', 'full'))
    for r in rows:
        print('%-22s %6.2f %6.2f' % (r['file'], r['center'], r['full']))
    vals = [r['center'] for r in rows]
    if vals:
        print('n=%d min=%.2f max=%.2f mean=%.2f range=%.2f' % (
            len(vals), min(vals), max(vals), sum(vals) / len(vals), max(vals) - min(vals)))


if __name__ == '__main__':
    sys.exit(main())
