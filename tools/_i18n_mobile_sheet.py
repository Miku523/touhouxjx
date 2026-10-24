#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
移动端 / 竖屏截图矩阵的对照图拼合（产物只写 _pt/mobile-matrix/）。

输入（tools/_pt_i18n_mobile.mjs 产出）：
    _pt/mobile-matrix/<screen>-<lang>-<vp>.png

输出：
    _pt/mobile-matrix/sheet-<screen>-<vp>.png   同屏四语 2×2（zh-Hans / zh-Hant / en / ja）—— 主对照图
    _pt/mobile-matrix/4up-<screen>.png          推荐 4-up：竖屏两视口 × 简中/日文，跨视口看同一屏
    _pt/mobile-matrix/overview-<vp>.png         九屏总览（zh-Hans 缩略图 3×3）

用法：
    python tools/_i18n_mobile_sheet.py
    python tools/_i18n_mobile_sheet.py --screens title,settings --vps 390x844
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_pt" / "mobile-matrix"

LANGS = [
    ("zh-Hans", "简体中文  zh-Hans"),
    ("zh-Hant", "繁體中文  zh-Hant"),
    ("en", "English  en"),
    ("ja", "日本語  ja"),
]
VPS = ["390x844", "768x1024"]
SCREENS = [
    "title", "settings", "keybinds", "difficulty", "charselect",
    "help", "music", "story", "ending",
]
SCREEN_LABEL = {
    "title": "标题 Title",
    "settings": "设置 Settings",
    "keybinds": "键位 Keybinds",
    "difficulty": "难度 Difficulty",
    "charselect": "选人 Character",
    "help": "操作说明 Help",
    "music": "音乐室 Music Room",
    "story": "剧情 Story",
    "ending": "结局 Ending",
}

BG = (12, 14, 20)
CELL_BG = (22, 24, 32)
EDGE = (74, 66, 48)
LABEL_FG = (232, 220, 196)
TITLE_FG = (240, 226, 190)
MUTED_FG = (150, 148, 140)
ACCENT = (196, 92, 88)

CJK_FONTS = [
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def pick_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in CJK_FONTS:
        try:
            if Path(p).exists():
                return ImageFont.truetype(p, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def draw_fit(d, xy, text: str, size: int, max_w: int, fill) -> None:
    """按可用宽度自动缩字号，避免标题被裁掉。"""
    while size > 10:
        f = pick_font(size)
        if d.textlength(text, font=f) <= max_w:
            break
        size -= 1
    d.text(xy, text, font=pick_font(size), fill=fill)


def png_path(screen: str, lang: str, vp: str) -> Path:
    return SRC / f"{screen}-{lang}-{vp}.png"


def missing(screens, vps, langs) -> list[str]:
    out = []
    for s in screens:
        for vp in vps:
            for l in langs:
                if not png_path(s, l, vp).exists():
                    out.append(str(png_path(s, l, vp).relative_to(ROOT)))
    return out


def load(screen: str, lang: str, vp: str) -> Image.Image | None:
    p = png_path(screen, lang, vp)
    if not p.exists():
        return None
    with Image.open(p) as im:
        return im.convert("RGB")


def placeholder(w: int, h: int, msg: str) -> Image.Image:
    im = Image.new("RGB", (max(1, w), max(1, h)), CELL_BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=EDGE)
    d.text((10, 10), msg, font=pick_font(max(12, min(20, h // 10))), fill=MUTED_FG)
    return im


# --------------------------------------------------------------------------- #
# 2×2 四语对照
# --------------------------------------------------------------------------- #
def build_sheet(screen: str, vp: str, out_dir: Path) -> Path | None:
    imgs: dict[str, Image.Image | None] = {l: load(screen, l, vp) for l, _ in LANGS}
    if not any(imgs.values()):
        return None
    ref = next(im for im in imgs.values() if im)
    cell_w, cell_h = ref.width // 2, ref.height // 2
    if cell_w < 40 or cell_h < 40:
        cell_w, cell_h = ref.width, ref.height

    pad, gap, label_h = 14, 14, 30
    head_h = 54
    sheet_w = pad * 2 + cell_w * 2 + gap
    sheet_h = head_h + pad + (cell_h + label_h + gap) * 2
    sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
    d = ImageDraw.Draw(sheet)

    f_label = pick_font(20)
    f_small = pick_font(15)
    draw_fit(d, (pad, 14), f"{SCREEN_LABEL.get(screen, screen)} · {vp}", 26, sheet_w - pad * 2 - 190, TITLE_FG)
    d.text((sheet_w - pad - 170, 20), "4 languages · 2×2", font=f_small, fill=MUTED_FG)

    for idx, (lang, label) in enumerate(LANGS):
        col, row = idx % 2, idx // 2
        x = pad + col * (cell_w + gap)
        y = head_h + pad + row * (cell_h + label_h + gap)
        d.rectangle([x - 1, y - 1, x + cell_w + 1, y + cell_h + label_h + 1], outline=EDGE)
        im = imgs[lang]
        if im is not None:
            cell = im.resize((cell_w, cell_h), Image.LANCZOS)
            sheet.paste(cell, (x, y))
        else:
            sheet.paste(placeholder(cell_w, cell_h, "missing"), (x, y))
        d.text((x + 4, y + cell_h + 6), label, font=f_label, fill=LABEL_FG)

    out = out_dir / f"sheet-{screen}-{vp}.png"
    sheet.save(out, optimize=True)
    return out


# --------------------------------------------------------------------------- #
# 推荐 4-up：两视口 × 简中/日文
# --------------------------------------------------------------------------- #
def build_4up(screen: str, out_dir: Path) -> Path | None:
    picks = [("390x844", "zh-Hans"), ("390x844", "ja"), ("768x1024", "zh-Hans"), ("768x1024", "ja")]
    imgs = [(vp, lang, load(screen, lang, vp)) for vp, lang in picks]
    if not any(im for _, _, im in imgs):
        return None

    target_h = 660
    boxes = []
    for vp, lang, im in imgs:
        if im is None:
            w = 300 if vp == "390x844" else 480
            boxes.append((vp, lang, None, w, target_h))
        else:
            h = target_h
            w = max(1, round(im.width * target_h / im.height))
            boxes.append((vp, lang, im, w, h))

    pad, gap, label_h, head_h = 16, 16, 32, 64
    left_w = max(b[3] for b in boxes[:2])
    right_w = max(b[3] for b in boxes[2:])
    sheet_w = pad * 2 + left_w + gap + right_w
    sheet_h = head_h + pad + (target_h + label_h + gap // 2) * 2 + gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
    d = ImageDraw.Draw(sheet)
    draw_fit(d, (pad, 12), f"{SCREEN_LABEL.get(screen, screen)} · 4-up 跨视口对照", 24, sheet_w - pad * 2, TITLE_FG)
    d.text((pad, 43), "390×844 手机 / 768×1024 平板 · 简中 vs 日文（最长/最短行差异最明显）",
           font=pick_font(14), fill=MUTED_FG)

    f_label = pick_font(18)
    for idx, (vp, lang, im, w, h) in enumerate(boxes):
        col, r = idx // 2, idx % 2
        col_w = left_w if col == 0 else right_w
        x = pad + (0 if col == 0 else left_w + gap) + (col_w - w) // 2
        y = head_h + pad + r * (target_h + label_h + gap // 2)
        d.rectangle([x - 1, y - 1, x + w + 1, y + h + label_h], outline=EDGE)
        if im is not None:
            sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        else:
            sheet.paste(placeholder(w, h, "missing"), (x, y))
        name = dict(LANGS).get(lang, lang)
        d.text((x + 4, y + h + 6), f"{vp} · {name}", font=f_label, fill=LABEL_FG)

    out = out_dir / f"4up-{screen}.png"
    sheet.save(out, optimize=True)
    return out


# --------------------------------------------------------------------------- #
# 九屏总览
# --------------------------------------------------------------------------- #
def build_overview(vp: str, lang: str, out_dir: Path) -> Path | None:
    imgs = [(s, load(s, lang, vp)) for s in SCREENS]
    if not any(im for _, im in imgs):
        return None
    thumb_h = 238
    cols, pad, gap, label_h = 3, 16, 12, 26
    thumbs = []
    for s, im in imgs:
        if im is None:
            thumbs.append((s, None, 110, thumb_h))
        else:
            thumbs.append((s, im, max(1, round(im.width * thumb_h / im.height)), thumb_h))
    cell_w = max(t[2] for t in thumbs)
    rows = (len(thumbs) + cols - 1) // cols
    head_h = 52
    sheet_w = pad * 2 + (cell_w + gap) * cols - gap
    sheet_h = head_h + pad + (thumb_h + label_h + gap) * rows
    sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
    d = ImageDraw.Draw(sheet)
    draw_fit(d, (pad, 12), f"九屏总览 · {vp} · {dict(LANGS).get(lang, lang)}", 22, sheet_w - pad * 2, TITLE_FG)
    f_label = pick_font(16)
    for i, (s, im, w, h) in enumerate(thumbs):
        col, row = i % cols, i // cols
        x = pad + col * (cell_w + gap) + (cell_w - w) // 2
        y = head_h + pad + row * (thumb_h + label_h + gap)
        d.rectangle([x - 1, y - 1, x + w + 1, y + thumb_h + label_h], outline=EDGE)
        if im is not None:
            sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        else:
            sheet.paste(placeholder(w, h, "missing"), (x, y))
        d.text((x + 2, y + thumb_h + 4), SCREEN_LABEL.get(s, s), font=f_label, fill=LABEL_FG)
    out = out_dir / f"overview-{vp}.png"
    sheet.save(out, optimize=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="拼 2×2 四语 / 4-up / 总览对照图")
    ap.add_argument("--screens", default="", help="逗号分隔，默认全部 9 屏")
    ap.add_argument("--vps", default="", help="逗号分隔，默认 %s" % ",".join(VPS))
    ap.add_argument("--langs", default="", help="逗号分隔，默认四语")
    ap.add_argument("--overview-lang", default="zh-Hans")
    ap.add_argument("--no-overview", action="store_true")
    args = ap.parse_args()

    if not SRC.is_dir():
        print(f"[sheet] 目录不存在：{SRC}（先跑 node tools/_pt_i18n_mobile.mjs）")
        return 1

    screens = [s.strip() for s in args.screens.split(",") if s.strip()] or SCREENS
    vps = [v.strip() for v in args.vps.split(",") if v.strip()] or VPS
    langs = [l.strip() for l in args.langs.split(",") if l.strip()] or [l for l, _ in LANGS]

    miss = missing(screens, vps, langs)
    if miss:
        print(f"[sheet] 缺图 {len(miss)} 张，缺失部分用占位块：")
        for m in miss[:12]:
            print("   - " + m)
        if len(miss) > 12:
            print(f"   … 其余 {len(miss) - 12} 张")

    made = []
    for screen in screens:
        for vp in vps:
            p = build_sheet(screen, vp, SRC)
            if p:
                made.append(p)
        p = build_4up(screen, SRC)
        if p:
            made.append(p)
    if not args.no_overview:
        for vp in vps:
            p = build_overview(vp, args.overview_lang, SRC)
            if p:
                made.append(p)

    print(f"\n[sheet] 生成 {len(made)} 张对照图 -> {SRC.relative_to(ROOT)}/")
    for p in made:
        with Image.open(p) as im:
            print(f"   {p.name:34s} {im.width}×{im.height}  {os.path.getsize(p) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
