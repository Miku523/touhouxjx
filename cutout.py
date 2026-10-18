#!/usr/bin/env python3
"""把纯白底的立绘抠成透明 PNG，并裁切/缩放到统一画幅。

用法: python cutout.py <in> <out.png> [目标高度] [白底阈值]
"""
import sys
from PIL import Image

def cutout(src, dst, target_h=560, thresh=243):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # 四角取白底基准
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            else:
                # 近白且低饱和 -> 半透明，消除白边
                mn = min(r, g, b)
                if mn >= thresh - 22 and max(r, g, b) - mn <= 12:
                    px[x, y] = (r, g, b, 110)

    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)

    cw, chh = im.size
    scale = target_h / float(chh)
    nw = max(1, int(round(cw * scale)))
    im = im.resize((nw, target_h), Image.LANCZOS)
    im.save(dst)
    print("%s %dx%d -> %dx%d" % (dst, cw, chh, nw, target_h))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: cutout.py <in> <out.png> [h] [thresh]")
    th = int(sys.argv[3]) if len(sys.argv) > 3 else 560
    tv = int(sys.argv[4]) if len(sys.argv) > 4 else 243
    cutout(sys.argv[1], sys.argv[2], th, tv)
