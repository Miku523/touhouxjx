#!/usr/bin/env python3
"""把 AI 生成的横向序列图切成透明 PNG 帧，按统一缩放 + 脚底对齐输出。

用法: python slice_frames.py <sheet> <outdir> <prefix> <帧数> [目标高度]
"""
import sys
import os
from PIL import Image


def whiten_to_alpha(f, thresh=243):
    px = f.load()
    w, h = f.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            else:
                mn = min(r, g, b)
                if mn >= thresh - 22 and max(r, g, b) - mn <= 12:
                    px[x, y] = (r, g, b, 110)
    return f


def main():
    src, outdir, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    target_h = int(sys.argv[5]) if len(sys.argv) > 5 else 240

    sheet = Image.open(src).convert("RGBA")
    W, H = sheet.size
    fw = W // n

    raw = []
    for i in range(n):
        f = sheet.crop((i * fw, 0, (i + 1) * fw, H))
        f = whiten_to_alpha(f)
        bbox = f.getbbox()
        if not bbox:
            print("frame %d empty" % i)
            continue
        raw.append((i, f.crop(bbox)))

    maxh = max(f.size[1] for _, f in raw)
    scale = target_h / float(maxh)
    maxw = max(int(round(f.size[0] * scale)) for _, f in raw)
    canvas_w = max(maxw, target_h)
    canvas_h = target_h + 12

    os.makedirs(outdir, exist_ok=True)
    for i, f in raw:
        nw = max(1, int(round(f.size[0] * scale)))
        nh = max(1, int(round(f.size[1] * scale)))
        f = f.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        # 脚底对齐画布底部留 4px，水平居中
        canvas.paste(f, ((canvas_w - nw) // 2, canvas_h - 4 - nh), f)
        p = os.path.join(outdir, "%s_%d.png" % (prefix, i))
        canvas.save(p)
        print("%s %dx%d (src %dx%d)" % (p, canvas_w, canvas_h, f.size[0], f.size[1]))


if __name__ == "__main__":
    main()
