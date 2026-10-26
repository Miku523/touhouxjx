#!/usr/bin/env python3
"""白底立绘抠图：只删「与画布边缘相连」的近白背景，保留角色内部的白围裙/白袖/白帽边。

之前 tools/gen_boss_battle.py 的 whiten() 是「凡近白像素一律删除」，
结果咲夜的白围裙、白泡泡袖、女仆帽白边被整片抠穿（贴到深色背景上会透出背景）。
这里改成连通域思路：从四条边向内洪泛，只有能被背景「连到」的近白像素才算背景。

用法:
  python tools/matte_white.py <src 白底图> <dst.png> [--height 560]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# 近白判定：三通道最小值达到这个就算「可能是背景白」
WHITE_MIN = 215
# 边缘羽化半径（像素，全分辨率下）
FEATHER = 0.8


def _flood_from_border(cand: np.ndarray) -> np.ndarray:
    """四连通洪泛：返回从画布边缘可达的 cand 像素。"""
    h, w = cand.shape
    mask = np.zeros((h, w), bool)
    mask[0, :] = cand[0, :]
    mask[-1, :] = cand[-1, :]
    mask[:, 0] = cand[:, 0]
    mask[:, -1] = cand[:, -1]

    def dilate(m):
        d = m.copy()
        d[1:, :] |= m[:-1, :]
        d[:-1, :] |= m[1:, :]
        d[:, 1:] |= m[:, :-1]
        d[:, :-1] |= m[:, 1:]
        return d

    while True:
        nxt = dilate(mask) & cand
        if np.array_equal(nxt, mask):
            return mask
        mask = nxt


def matte(im: Image.Image, height: int | None = None, white_min: int = WHITE_MIN) -> Image.Image:
    """白底 -> 透明底（保留内部纯白衣物），可选把内容等比缩到 height 高。"""
    im = im.convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    cand = a.min(axis=2) >= white_min
    bg = _flood_from_border(cand)

    alpha = (~bg).astype(np.float32) * 255.0
    alpha_img = Image.fromarray(alpha.astype(np.uint8), 'L')
    if FEATHER > 0:
        alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(FEATHER))
    A = (np.asarray(alpha_img).astype(np.float32) / 255.0)[:, :, None]

    rgb = a.astype(np.float32)
    # 白色去污：半透明边缘本来是「角色色 × a + 白 × (1-a)」，反解掉白色
    with np.errstate(divide='ignore', invalid='ignore'):
        dec = (rgb - (1.0 - A) * 255.0) / np.maximum(A, 1e-3)
    dec = np.clip(dec, 0, 255)
    rgb_out = np.where(A > 0.02, dec, rgb)

    out = Image.fromarray(np.dstack([rgb_out, alpha_img]).clip(0, 255).astype(np.uint8), 'RGBA')
    bbox = out.getbbox()
    if not bbox:
        raise SystemExit('empty cutout')
    out = out.crop(bbox)
    if height:
        s = height / float(out.size[1])
        nw = max(1, int(round(out.size[0] * s)))
        # 预乘后缩放，避免透明边缘发黑
        arr = np.asarray(out).astype(np.float32)
        arr[:, :, :3] *= arr[:, :, 3:4] / 255.0
        pm = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').resize((nw, height), Image.LANCZOS)
        pm2 = np.asarray(pm).astype(np.float32)
        al = np.maximum(pm2[:, :, 3:4] / 255.0, 1e-3)
        out = Image.fromarray(np.dstack([np.clip(pm2[:, :, :3] / al, 0, 255), pm2[:, :, 3]])
                              .clip(0, 255).astype(np.uint8), 'RGBA')
    return out


def main(argv):
    if len(argv) < 3:
        raise SystemExit(__doc__)
    src, dst = Path(argv[1]), Path(argv[2])
    height = 560
    if '--height' in argv:
        height = int(argv[argv.index('--height') + 1])
    out = matte(Image.open(src), height)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)
    print('OK %s %dx%d' % (dst, out.size[0], out.size[1]))


if __name__ == '__main__':
    main(sys.argv)
