"""
妖梦立绘抠图（纯色底 → 透明 PNG）。

出图时要求「平涂纯色浅薄荷背景 (#BFEEDF)、无光晕/无花瓣/无投影」，因此这里可以直接色键：
  1) 取四边像素的中位色作为背景色（不写死，容忍模型微调色相）
  2) 到背景色的欧氏距离 → 软 alpha（12/30 双阈值，边缘自然过渡）
  3) 距离极小的连通块（杂点）丢掉，人物本体保留
  4) 按内容高度等比缩放，脚底贴底（与其它 Boss 素材一致）

为什么不用 tools/cutout.py：白底图 + 白色衣物（白袜/白衬衫）会被泛洪抠穿，导致
「幽灵腿」；纯色底 + 色键没有这个坑，也顺便把外围光晕切干净。

用法：python tools/_youmu_matting.py <源图> <输出.png> <内容高>
依赖：仅 Pillow + numpy
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

SOFT_LO = 12.0   # 距背景色小于此 → 全透明
SOFT_HI = 34.0   # 大于此 → 完全不透明
MIN_AREA = 400   # 小于此像素数的连通块视为杂点


def components(mask):
    """4 连通标记（BFS），返回 (labels, sizes)。"""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if labels[y0, x0]:
            continue
        cur += 1
        q = deque([(y0, x0)])
        labels[y0, x0] = cur
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = cur
                    q.append((ny, nx))
        sizes.append(n)
    return labels, sizes


def matte(src_path, dst_path, target_h):
    im = Image.open(src_path).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]

    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]], axis=0)
    bg = np.median(border, axis=0)

    # 背景判定：品红底的「品红度」= (R+B)/2 - G，背景约 190+，人物身上几乎没有品红。
    # 用色相而不是灰度距离，白袜/白衬衫的薄荷色阴影不会被误判成背景。
    bg_mag = float((bg[0] + bg[2]) / 2.0 - bg[1])
    if bg_mag > 40:
        mag = (arr[:, :, 0] + arr[:, :, 2]) / 2.0 - arr[:, :, 1]
        soft = np.clip((bg_mag - mag) / (bg_mag * 0.35), 0, 1)
        # 反预乘去色边：半透明像素把混进来的品红扣掉，避免紫边
        a3 = soft[:, :, None]
        safe = np.maximum(a3, 0.02)
        arr = np.clip((arr - (1.0 - a3) * bg[None, None, :]) / safe, 0, 255)
        # 去残留紫边：反预乘后边缘仍偏品红的像素，往灰度拉回来（只动色相，不动 alpha）
        mag2 = (arr[:, :, 0] + arr[:, :, 2]) / 2.0 - arr[:, :, 1]
        k = np.clip(mag2 / 45.0, 0, 1) * 0.9
        # 用绿色通道当灰度基准：品红污染只抬 R/B，G 最接近原色，黑色缎带才不会变白
        gray = arr[:, :, 1]
        for c in (0, 2):
            arr[:, :, c] = arr[:, :, c] + (gray - arr[:, :, c]) * k
        dist = np.where(soft > 0.5, 999.0, 0.0)  # 背景掩膜，仅用于连通块筛选
    else:
        dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
        soft = np.clip((dist - SOFT_LO) / (SOFT_HI - SOFT_LO), 0, 1)

    labels, sizes = components(dist > SOFT_HI)
    keep = np.zeros((h, w), dtype=bool)
    for idx, size in enumerate(sizes):
        if not idx or size < MIN_AREA:
            continue
        mean = arr[labels == idx].mean(axis=0)
        # 与背景色太像的大块（投影、渐变底）一律丢掉：它们的均值几乎就是背景色
        if np.sqrt(((mean - bg) ** 2).sum()) < 48:
            continue
        keep |= labels == idx
    alpha = (soft * keep * 255).astype(np.uint8)

    # 内部空洞补实：白袜/白衬衫被描边包住、四边泛洪到不了 —— 填成完全不透明
    low = alpha < 16
    reach = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if low[y, x]:
                reach[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if low[y, x]:
                reach[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and low[ny, nx] and not reach[ny, nx]:
                reach[ny, nx] = True
                q.append((ny, nx))
    alpha = np.where(~reach & keep, 255, alpha).astype(np.uint8)

    # 收边 1px + 重新羽化：色键的硬边总会残留一圈背景色（品红/薄荷）描边，
    # 直接把这圈切掉，比逐像素去色边干净，游戏分辨率下看不出少了 1px。
    a_img = Image.fromarray(alpha, "L")
    a_img = a_img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    alpha = np.asarray(a_img)

    # 掉「投影 / 暗背景」：模型会在脚下画一块暗色投影，它的色相仍是背景色，只是变暗。
    # 判定标准：RGB 三通道对背景色是等比例缩小（色相不变），人物色块不满足。
    bg_safe = np.maximum(bg[None, None, :], 1.0)
    ratio = arr / bg_safe
    dark_bg = (
        (ratio.max(axis=2) < 0.92)
        & (ratio.min(axis=2) > 0.15)
        & (ratio.std(axis=2) < 0.06)
    )
    alpha = alpha.copy()
    alpha[dark_bg] = 0

    # 最后一刀：任何还带品红倾向的像素（典型是抗锯齿边）直接压成同亮度的灰，
    # 否则缩小到游戏尺寸后轮廓会挂一圈粉线。
    pink = (arr[:, :, 0] - arr[:, :, 1] > 18) & (arr[:, :, 2] - arr[:, :, 1] > 18)
    if pink.any():
        gray = arr[:, :, 1]
        for c in range(3):
            arr[:, :, c] = np.where(pink, gray, arr[:, :, c])

    out = Image.fromarray(np.dstack([arr.astype(np.uint8), alpha]), "RGBA")
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    cw, ch = out.size
    scale = target_h / float(ch)
    out = out.resize((max(1, int(round(cw * scale))), target_h), Image.LANCZOS)
    out.save(dst_path, "PNG")
    kept = sum(1 for i, s in enumerate(sizes) if i and s >= MIN_AREA)
    print(f"{dst_path}  {out.size[0]}x{out.size[1]}  ({cw}x{ch} -> scaled, bg≈rgb({int(bg[0])},{int(bg[1])},{int(bg[2])}), 保留 {kept} 块)")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    matte(sys.argv[1], sys.argv[2], int(sys.argv[3]))
