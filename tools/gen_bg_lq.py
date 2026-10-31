#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成厚涂背景的「低清档」：src/art/gen/bg/<key>_lq.webp（宽 1280，质量 44）。

为什么要有这一档
----------------
高清档（<key>.webp / .avif，2048 宽）单张 135–460KB。线上实测（租用/家用宽带
到 GitHub Pages）十几张图并发时单张要 10–40s 才落地，弱网更要一两分钟；这段时间
关卡只能画程序化天空（深紫星空 + 黑剪影），玩家看到的就是「画面不对」。

低清档单张 30–80KB（1.0–1.6s @50KB/s），进关第一帧就能贴厚涂图；高清档到货后
由 src/game/stage.js 的 _scheduleUpgrade() 在空闲帧里把合成层换成高清，画面无缝升档。

合成层是 (VIEW_W + 420) × VIEW_H = 1700×720，1280 宽的低清档在层里是 1.33× 放大，
作为「过渡帧」完全够用；真正定妆的还是 2048 高清档。

用法
----
  python tools/gen_bg_lq.py            # 只处理缺失的
  python tools/gen_bg_lq.py --force    # 全量重编
  python tools/gen_bg_lq.py --dry-run  # 只报告体积，不写盘
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BG = ROOT / "src" / "art" / "gen" / "bg"
WIDTH = 1280
QUALITY = 44
METHOD = 6          # WebP 编码强度：6 = 最慢最省


def target_path(src: Path) -> Path:
    return src.with_name(src.stem + "_lq.webp")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="已有低清档也重编")
    ap.add_argument("--dry-run", action="store_true", help="只报告，不写盘")
    args = ap.parse_args(argv)

    sources = sorted(p for p in BG.glob("*.webp") if not p.stem.endswith("_lq"))
    if not sources:
        print("没有找到源图：%s" % BG)
        return 1

    total_in = total_out = 0
    rows = []
    for src in sources:
        dst = target_path(src)
        in_bytes = src.stat().st_size
        total_in += in_bytes
        if dst.exists() and not args.force and not args.dry_run:
            rows.append((src.stem, in_bytes, dst.stat().st_size, "skip"))
            total_out += dst.stat().st_size
            continue
        im = Image.open(src).convert("RGB")
        w, h = im.size
        if w != WIDTH:
            nh = max(1, round(h * WIDTH / w))
            im = im.resize((WIDTH, nh), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="WEBP", quality=QUALITY, method=METHOD)
        data = buf.getvalue()
        if args.dry_run:
            rows.append((src.stem, in_bytes, len(data), "dry"))
        else:
            dst.write_bytes(data)
            rows.append((src.stem, in_bytes, len(data), "ok"))
            total_out += len(data)

    for name, ib, ob, st in rows:
        print("%-12s %7.1fKB -> %6.1fKB  -%3.0f%%  %s" % (
            name, ib / 1024, ob / 1024, (1 - ob / ib) * 100, st))
    if not args.dry_run:
        print("合计 %.1fKB -> %.1fKB" % (total_in / 1024, total_out / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
