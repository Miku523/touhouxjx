"""
把 Seedream 出的白底立绘处理成游戏可用的透明 PNG。

用法：
    python tools/cutout.py 输入图 输出图 [目标高度]

做法：
  1. 从四角 flood fill 背景（阈值 40），得到背景掩膜
  2. 背景像素 alpha=0，并对边缘做 1px 的羽化，避免白边
  3. 裁掉四周透明边
  4. 等比缩放到目标高度
"""
import sys
from collections import deque

from PIL import Image


def cutout(src, dst, target_h=560, thresh=40):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 以四角为种子做 BFS，标记与背景连通的像素
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    bg_color = px[0, 0][:3]
    visited = bytearray(w * h)
    q = deque()
    for sx, sy in seeds:
        q.append((sx, sy))
        visited[sy * w + sx] = 1

    def is_bg(c):
        return (
            abs(c[0] - bg_color[0]) <= thresh
            and abs(c[1] - bg_color[1]) <= thresh
            and abs(c[2] - bg_color[2]) <= thresh
        )

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not visited[i] and is_bg(px[nx, ny]):
                    visited[i] = 1
                    q.append((nx, ny))

    # 应用 alpha
    for y in range(h):
        row = y * w
        for x in range(w):
            if visited[row + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    # 边缘羽化：把紧贴透明区的半透明白边压掉一些
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            near = 0
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if px[nx, ny][3] == 0:
                    near += 1
            if near >= 2 and r > 225 and g > 225 and b > 225:
                px[x, y] = (r, g, b, 90)

    # 裁边
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)

    # 缩放
    cw, ch = im.size
    scale = target_h / float(ch)
    nw = max(1, int(round(cw * scale)))
    im = im.resize((nw, target_h), Image.LANCZOS)
    im.save(dst, "PNG")
    print(f"{dst}  {nw}x{target_h}  ({cw}x{ch} -> scaled)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 560
    cutout(sys.argv[1], sys.argv[2], h)
