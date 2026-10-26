#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 src/art 下的 PNG/JPG 素材转成 WebP（同目录同名，分辨率不变），并逐张输出质量报告。

设计要点
--------
* 原图（.png/.jpg）一律保留：只新增 .webp，随时可回滚/对比。
* 4 个 PWA / favicon 图标不转换：src/art/favicon.png、apple-touch-icon.png、
  pwa-192.png、pwa-512.png（manifest / <link rel=icon> 引用，必须继续是 PNG）。
* RGBA（透明人物）用 quality 88~92 + method 6 + alpha_quality 100（alpha 无损）+ exact，
  RGB 背景用 quality 78~82 + method 6。默认取各自区间上沿（RGBA 90 / RGB 82）。
* 质量闸门（报告里逐张标 PASS/FAIL）：
    - RGB PSNR：背景 >= 40dB，人物 >= 38dB
    - alpha：PSNR >= 42dB 或逐像素最大误差 <= 8
  *默认*配置是「按体积优先的推荐档位」，AI 生成的厚涂图带颗粒噪声，PSNR 会低于闸门
  （用 --strict-gate 可以逐张升 quality 直到过闸门，但背景会涨到接近原 JPG 体积，
  见 README / 报告里的对照数据）。
* 可复现：同一 Pillow/libwebp 版本下输出字节完全一致（method 6，无随机性）。

用法
----
  python tools/optimize_art_webp.py                # 只补缺失/过期的 .webp
  python tools/optimize_art_webp.py --dry-run      # 只测量不写盘（仍然真实编码）
  python tools/optimize_art_webp.py --force        # 全部重编
  python tools/optimize_art_webp.py --strict-gate  # 逐张升 quality 直到满足 PSNR 闸门
  python tools/optimize_art_webp.py --quality-rgb 80 --quality-rgba 92
  python tools/optimize_art_webp.py --only bg/     # 只处理相对路径含该子串的图
  python tools/optimize_art_webp.py --list-only    # 只看会处理哪些图
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "src" / "art"

# 必须保持 PNG 的 4 个图标（manifest / apple-touch-icon / favicon）
KEEP_PNG = {
    "favicon.png",
    "apple-touch-icon.png",
    "pwa-192.png",
    "pwa-512.png",
}

# 质量档位（任务书给定区间）
RGB_QUALITY = 82      # 背景 78~82，取上沿
RGB_QUALITY_MIN = 78
RGBA_QUALITY = 90     # 人物 88~92，取中间
RGBA_QUALITY_MIN = 88
RGBA_QUALITY_MAX = 92

METHOD = 6
ALPHA_QUALITY = 100   # alpha 平面无损
EXACT = True          # 保留全透明像素的 RGB，避免边缘/缩放晕影

GATE_BG_RGB = 40.0    # 背景 RGB PSNR 下限
GATE_CHAR_RGB = 38.0  # 人物 RGB PSNR 下限
GATE_ALPHA = 42.0     # alpha PSNR 下限
GATE_ALPHA_MAXERR = 8 # alpha 逐像素最大误差上限

REPORT = ROOT / "tools" / "_opt" / "webp_report.json"


# ---------------------------------------------------------------- 分类
def category(rel: Path) -> str:
    """按仓库内的相对路径（相对 src/art）分组，用于报告小计。"""
    parts = list(rel.parts)
    if parts and parts[0] == "gen":   # 所有素材都在 src/art/gen/ 下
        parts = parts[1:]
    if not parts:
        return "其他"
    if parts[0] == "bg":
        return "背景 JPG（关内厚涂）"
    if rel.name == "title_bg.jpg" or rel.name == "title_bg.webp":
        return "标题背景"
    if parts[0] == "boss":
        return "战斗立绘（Boss）"
    if parts[0] == "run":
        return "自机动作帧"
    if parts[0] == "fairy":
        return "妖精（五色）"
    if rel.name == "fairy.png":
        return "妖精（通用）"
    if rel.stem.endswith("_title"):
        return "标题 / 符卡 cut-in 立绘"
    return "对话立绘"


def source_files(only: str | None) -> list[Path]:
    out = []
    for p in sorted(ART.rglob("*")):
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        rel = p.relative_to(ART)
        if len(rel.parts) == 1 and rel.name in KEEP_PNG:
            continue  # 4 个图标保持 PNG
        if only and only.replace("\\", "/") not in rel.as_posix():
            continue
        out.append(p)
    return out


# ---------------------------------------------------------------- 图像工具
def has_alpha(im: Image.Image) -> bool:
    if im.mode in ("RGBA", "LA"):
        return True
    if im.mode == "P" and "transparency" in im.info:
        return True
    return False


def as_rgba_or_rgb(im: Image.Image) -> Image.Image:
    """统一成 RGBA / RGB 两种模式之一，避免调色板图被判成 RGB 丢掉透明。"""
    if has_alpha(im):
        return im.convert("RGBA")
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    if mse == 0:
        return float("inf")
    return 10.0 * np.log10(255.0 * 255.0 / mse)


def luma(arr: np.ndarray) -> np.ndarray:
    a = arr.astype(np.float64)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def encode(im: Image.Image, quality: int, alpha: bool) -> bytes:
    kwargs = dict(format="WEBP", quality=quality, method=METHOD)
    if alpha:
        kwargs.update(alpha_quality=ALPHA_QUALITY, exact=EXACT)
    if im.info.get("icc_profile"):
        kwargs["icc_profile"] = im.info["icc_profile"]
    buf = io.BytesIO()
    im.save(buf, **kwargs)
    return buf.getvalue()


def measure(src: Image.Image, data: bytes) -> dict:
    """对比原图与 webp 解码结果，算 RGB / luma / alpha PSNR。"""
    a = np.asarray(src)
    dec = Image.open(io.BytesIO(data))
    dec.load()
    b = np.asarray(dec)
    if a.shape != b.shape:
        raise RuntimeError(f"尺寸变了：{a.shape} -> {b.shape}")
    alpha = a.shape[2] == 4
    if alpha:
        m = a[..., 3] > 0
        m_opaque = a[..., 3] == 255
        rgb = psnr(a[..., :3], b[..., :3])
        rgb_masked = psnr(a[..., :3][m], b[..., :3][m]) if m.any() else float("inf")
        rgb_opaque = psnr(a[..., :3][m_opaque], b[..., :3][m_opaque]) if m_opaque.any() else float("inf")
        luma_all = psnr(luma(a[..., :3]), luma(b[..., :3]))
        al = a[..., 3]
        bl = b[..., 3]
        a_psnr = psnr(al, bl)
        a_max = int(np.abs(al.astype(np.int16) - bl.astype(np.int16)).max())
    else:
        rgb = psnr(a, b)
        rgb_masked = rgb_opaque = rgb
        luma_all = psnr(luma(a), luma(b))
        a_psnr = float("inf")
        a_max = 0
    return dict(
        psnr_rgb=rgb,
        psnr_rgb_masked=rgb_masked,
        psnr_rgb_opaque=rgb_opaque,
        psnr_luma=luma_all,
        psnr_alpha=a_psnr,
        alpha_maxerr=a_max,
        decoded_size=list(dec.size),
    )


def inspect_existing(path: Path, dst: Path) -> dict:
    """已有 .webp：不重编，只解码回来做同样的 PSNR 体检（报告因此始终完整）。"""
    im = Image.open(path)
    im.load()
    alpha = has_alpha(im)
    src_im = as_rgba_or_rgb(im)
    data = dst.read_bytes()
    info = measure(src_im, data)
    info.update(
        path=str(path.relative_to(ROOT)).replace("\\", "/"),
        webp=str(dst.relative_to(ROOT)).replace("\\", "/"),
        category=category(path.relative_to(ART)),
        mode="RGBA" if alpha else "RGB",
        width=src_im.size[0],
        height=src_im.size[1],
        orig_bytes=path.stat().st_size,
        webp_bytes=len(data),
        ratio=round(len(data) / path.stat().st_size, 4),
        quality=None,
        quality_start=None,
        alpha_quality=ALPHA_QUALITY if alpha else None,
        method=METHOD,
        gate_ok=gate_ok(info, alpha),
        seconds=0.0,
        skipped=True,
    )
    return info


def row_line(info: dict) -> str:
    rel = info["path"]
    if len(rel) > 43:
        rel = "…" + rel[-42:]
    rgb = info["psnr_rgb"]
    lum = info["psnr_luma"]
    alp = info["psnr_alpha"]
    q = info["quality"] if info["quality"] is not None else "-"
    return (f"{rel:<44}{info['width']}x{info['height']:<5}{info['mode']:>4}"
            f"{info['orig_bytes']/1024:>8.0f}{info['webp_bytes']/1024:>8.0f}"
            f"{info['webp_bytes']/info['orig_bytes']*100:>6.0f}%{q:>4}"
            f"{('inf' if rgb is None else round(rgb,1)):>7}"
            f"{('inf' if lum is None else round(lum,1)):>7}"
            f"{('无' if not info['alpha_quality'] else ('inf' if alp is None else round(alp,1))):>7}"
            f"{info['alpha_maxerr']:>5}  {'PASS' if info['gate_ok'] else 'FAIL'}"
            f"{'  SKIP(已存在)' if info.get('skipped') else ''}")


def json_safe(v):
    """递归把 inf/nan 写成 null：JSON 标准不允许 Infinity（psnr_alpha=null 表示 alpha 平面无损）。"""
    if isinstance(v, float):
        return None if (np.isnan(v) or np.isinf(v)) else v
    if isinstance(v, dict):
        return {k: json_safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [json_safe(x) for x in v]
    return v


def num(v: float, nd=2):
    """inf -> None（JSON 里不写 Infinity）；其余保留 nd 位。"""
    if v is None:
        return None
    if isinstance(v, float) and (v == float("inf") or np.isinf(v)):
        return None
    return round(float(v), nd)


# ---------------------------------------------------------------- 主流程
def process(path: Path, args) -> dict:
    rel = path.relative_to(ART)
    im = Image.open(path)
    im.load()
    alpha = has_alpha(im)
    src = as_rgba_or_rgb(im)
    orig_bytes = path.stat().st_size
    dst = path.with_suffix(".webp")

    q0 = args.quality_rgba if alpha else args.quality_rgb
    q = q0
    t0 = time.time()
    data = encode(src, q, alpha)
    info = measure(src, data)
    # --strict-gate：一直升 quality 直到过闸门（上限 100）
    while args.strict_gate and q < 100:
        if gate_ok(info, alpha):
            break
        q = min(100, q + 2)
        data = encode(src, q, alpha)
        info = measure(src, data)
    elapsed = time.time() - t0
    info.update(
        path=str(path.relative_to(ROOT)).replace("\\", "/"),
        webp=str(dst.relative_to(ROOT)).replace("\\", "/"),
        category=category(rel),
        mode="RGBA" if alpha else "RGB",
        width=src.size[0],
        height=src.size[1],
        orig_bytes=orig_bytes,
        webp_bytes=len(data),
        ratio=round(len(data) / orig_bytes, 4) if orig_bytes else None,
        quality=q,
        quality_start=q0,
        alpha_quality=ALPHA_QUALITY if alpha else None,
        method=METHOD,
        gate_ok=gate_ok(info, alpha),
        seconds=round(elapsed, 2),
    )
    return {"dst": dst, "data": data, "info": info}


def gate_ok(info: dict, alpha: bool) -> bool:
    rgb_need = GATE_CHAR_RGB if alpha else GATE_BG_RGB
    if info["psnr_rgb"] is not None and info["psnr_rgb"] < rgb_need:
        return False
    if alpha:
        a = info["psnr_alpha"]
        if a is not None and a < GATE_ALPHA and info["alpha_maxerr"] > GATE_ALPHA_MAXERR:
            return False
    return True


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="src/art PNG/JPG -> WebP")
    ap.add_argument("--dry-run", action="store_true", help="只测量，不写盘")
    ap.add_argument("--force", action="store_true", help="全部重编（覆盖已有 .webp）")
    ap.add_argument("--strict-gate", action="store_true", help="逐张升 quality 直到满足 PSNR 闸门")
    ap.add_argument("--quality-rgb", type=int, default=RGB_QUALITY, help=f"RGB 背景 quality（默认 {RGB_QUALITY}）")
    ap.add_argument("--quality-rgba", type=int, default=RGBA_QUALITY, help=f"RGBA 人物 quality（默认 {RGBA_QUALITY}）")
    ap.add_argument("--only", default=None, help="只处理相对路径包含该子串的图")
    ap.add_argument("--list-only", action="store_true", help="只列文件")
    ap.add_argument("--no-report", action="store_true", help="不写 tools/_opt/webp_report.json")
    args = ap.parse_args(argv)

    files = source_files(args.only)
    if not files:
        print("没有匹配的素材文件")
        return 1
    if args.list_only:
        for p in files:
            print(p.relative_to(ROOT).as_posix())
        return 0

    print(f"素材目录 : {ART}")
    print(f"待处理   : {len(files)} 张  |  模式: {'DRY-RUN' if args.dry_run else ('FORCE' if args.force else '补齐缺失')}"
          f"{'  |  STRICT-GATE' if args.strict_gate else ''}")
    print(f"参数     : RGB q{args.quality_rgb} / RGBA q{args.quality_rgba} method={METHOD} "
          f"alpha_quality={ALPHA_QUALITY} exact={EXACT}")
    header = f"{'文件':<44}{'尺寸':>10}{'模式':>6}{'原KB':>8}{'webpKB':>8}{'体积':>7}{'q':>4}{'RGB':>7}{'luma':>7}{'alpha':>7}{'αmax':>5}  闸门"
    print("\n" + header)
    print("-" * len(header))

    rows = []
    written = 0
    skipped = 0
    for path in files:
        dst = path.with_suffix(".webp")
        reuse = (dst.exists() and not args.force and not args.strict_gate and not args.dry_run
                 and dst.stat().st_mtime >= path.stat().st_mtime)
        if reuse:
            info = inspect_existing(path, dst)
            skipped += 1
        else:
            r = process(path, args)
            info = r["info"]
            rows.append(info)
            if not args.dry_run:
                dst.write_bytes(r["data"])
                written += 1
        if reuse:
            rows.append(info)
        print(row_line(info))

    # ---------------- 汇总 ----------------
    before = sum(r["orig_bytes"] for r in rows)
    after = sum(r["webp_bytes"] for r in rows)
    print("\n" + "=" * 78)
    print("分类小计：")
    groups: dict[str, dict] = {}
    for r in rows:
        g = groups.setdefault(r["category"], dict(n=0, before=0, after=0))
        g["n"] += 1
        g["before"] += r["orig_bytes"]
        g["after"] += r["webp_bytes"]
    for name, g in groups.items():
        print(f"  {name:<24}{g['n']:>3} 张  {g['before']/1048576:>6.2f} MB -> {g['after']/1048576:>6.2f} MB"
              f"  省 {(g['before']-g['after'])/1048576:>5.2f} MB ({(1-g['after']/max(g['before'],1))*100:>4.1f}%)")
    print(f"  {'合计':<24}{len(rows):>3} 张  {before/1048576:>6.2f} MB -> {after/1048576:>6.2f} MB"
          f"  省 {(before-after)/1048576:>5.2f} MB ({(1-after/max(before,1))*100:>4.1f}%)")

    measured = [r for r in rows if r["psnr_rgb"] is not None]
    if measured:
        worst = sorted(measured, key=lambda r: (r["psnr_rgb"] if r["psnr_rgb"] is not None else 999))[:5]
        print("\nRGB PSNR 最低 5 张：")
        for r in worst:
            print(f"  {r['path']:<46} {num(r['psnr_rgb'],2):>6} dB  (luma {num(r['psnr_luma'],2)} dB, q{r['quality'] if r['quality'] is not None else '-'})")
        fails = [r for r in rows if not r["gate_ok"]]
        print(f"\n质量闸门：{len(rows)-len(fails)}/{len(rows)} PASS，{len(fails)} FAIL")
        if fails:
            print("  FAIL 明细（默认档位下 AI 厚涂图的颗粒噪声导致 PSNR 偏低；--strict-gate 可强制达标）：")
            for r in fails:
                print(f"    {r['path']:<44} RGB {num(r['psnr_rgb'],2)} dB / 需要 {GATE_BG_RGB if r['mode']=='RGB' else GATE_CHAR_RGB} dB")
    print(f"\n写入 {written} 个 .webp，跳过 {skipped} 个{'（dry-run：未写盘）' if args.dry_run else ''}")

    if not args.no_report:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(
            generatedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            artDir=str(ART),
            settings=dict(rgbQuality=args.quality_rgb, rgbaQuality=args.quality_rgba, method=METHOD,
                          alphaQuality=ALPHA_QUALITY, exact=EXACT, strictGate=args.strict_gate),
            gates=dict(bgRgbPsnr=GATE_BG_RGB, charRgbPsnr=GATE_CHAR_RGB,
                       alphaPsnr=GATE_ALPHA, alphaMaxErr=GATE_ALPHA_MAXERR),
            totals=dict(before=before, after=after, saved=before - after,
                        savedRatio=round(1 - after / max(before, 1), 4)),
            groups={k: dict(n=v["n"], before=v["before"], after=v["after"]) for k, v in groups.items()},
            images=rows,
        )
        REPORT.write_text(json.dumps(json_safe(payload), ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
        print(f"报告：{REPORT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())