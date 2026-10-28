#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把已 WebP 化的美术素材再生成一层 AVIF（同目录同名，保留 .webp 作回退）。

设计要点
--------
* 输入是 tools/_opt/webp_report.json 里的 62 个 .webp（1.6.15 WebP 化的产物）。
  母版 PNG/JPG 仍在 src/art/gen 下，因此 AVIF 的 PSNR 一律相对【母版】算，
  与 webp_table.md 里的 PSNR 同口径，可以直接横向比较。
* 逐张定质量：在候选 quality 阶梯上从低往高试，取第一个同时满足下面三条的档位：
    1. 质量：PSNR 不低于现有 WebP 太多（默认允许 -0.6 dB 的差），
       RGBA 图另外看 alpha 平面（PSNR >= 50 dB 且逐像素最大误差 <= 16），
       避免抠图边缘被 AVIF 的 alpha 有损编码啃出毛边；
    2. 体积：AVIF 至少比 WebP 小 8%（min_gain），否则不值得多存一份；
    3. 编码成功且解码尺寸一致。
  不满足则这张图【不生成 .avif】，运行期继续用 .webp（报告里标 SKIP 及原因）。
* 生成的 src/art/avif_manifest.js 列出确有 .avif 的图，运行期 src/art/img.js 据此
  决定是否请求 .avif，避免那些没转的图白白吃一次 404。
* 可复现：同 Pillow/libavif 版本 + 同参数下输出字节稳定（speed 固定、无随机性）。

用法
----
  python tools/optimize_art_avif.py                 # 全量生成（已有 .avif 也会重编）
  python tools/optimize_art_avif.py --dry-run       # 只测量，不写盘
  python tools/optimize_art_avif.py --only bg/      # 只处理相对路径含该子串的图
  python tools/optimize_art_avif.py --list-only     # 只看会处理哪些图
  python tools/optimize_art_avif.py --speed 4 --tol 0.6 --min-gain 0.08
  python tools/optimize_art_avif.py --no-manifest   # 不写 src/art/avif_manifest.js
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
GEN = ART / "gen"
WEBP_REPORT = ROOT / "tools" / "_opt" / "webp_report.json"
REPORT = ROOT / "tools" / "_opt" / "avif_report.json"
TABLE = ROOT / "tools" / "_opt" / "avif_table.md"
MANIFEST = ART / "avif_manifest.js"

# 首屏（标题画面）三张必需素材：单独汇总体积变化
FIRST_SCREEN = ("title_bg", "marisa_title", "reimu_title")

DEFAULTS = dict(
    speed=4,           # libavif 0(最慢/最小)~10(最快)；4 是体积/耗时较好的折中
    tol=0.6,           # 允许 AVIF 相对 WebP 的 PSNR 降幅（dB）
    min_gain=0.08,     # AVIF 至少比 WebP 小 8% 才转
    q_start_rgb=52,
    q_start_rgba=58,
    q_step=4,
    q_max=92,
    alpha_psnr=50.0,   # RGBA：alpha 平面 PSNR 下限
    alpha_maxerr=16,   # RGBA：alpha 逐像素最大误差上限
)


# ---------------------------------------------------------------- 图像工具
def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    if mse == 0:
        return float("inf")
    return 10.0 * np.log10(255.0 * 255.0 / mse)


def encode(im: Image.Image, quality: int, speed: int) -> bytes:
    kwargs = dict(format="AVIF", quality=quality, speed=speed)
    if im.info.get("icc_profile"):
        kwargs["icc_profile"] = im.info["icc_profile"]
    buf = io.BytesIO()
    im.save(buf, **kwargs)
    return buf.getvalue()


def measure(src_arr: np.ndarray, data: bytes, alpha: bool) -> dict:
    """解码 AVIF，与母版逐像素对比（RGBA 的 RGB 误差只统计 alpha>0 的像素）。"""
    dec = Image.open(io.BytesIO(data))
    dec.load()
    b = np.asarray(dec)
    a = src_arr
    if a.shape != b.shape:
        raise RuntimeError(f"解码尺寸变了：{a.shape} -> {b.shape}")
    if alpha:
        m = a[..., 3] > 0
        rgb_masked = psnr(a[..., :3][m], b[..., :3][m]) if m.any() else float("inf")
        rgb_all = psnr(a[..., :3], b[..., :3])
        al = psnr(a[..., 3], b[..., 3])
        amax = int(np.abs(a[..., 3].astype(np.int16) - b[..., 3].astype(np.int16)).max())
    else:
        rgb_masked = rgb_all = psnr(a, b)
        al = float("inf")
        amax = 0
    return dict(
        psnr_rgb=rgb_masked,      # 与 webp_report 的 psnr_rgb_masked 同口径
        psnr_rgb_all=rgb_all,
        psnr_alpha=al,
        alpha_maxerr=amax,
        decoded_size=list(dec.size),
    )


def img_quality_metric(info: dict, alpha: bool) -> float | None:
    """比较用的质量指标：RGBA 用「去透明像素后的 RGB PSNR」，RGB 用整体 PSNR。"""
    key = "psnr_rgb_masked" if alpha else "psnr_rgb"
    v = info.get(key)
    return None if v is None else float(v)


def json_safe(v):
    if isinstance(v, np.generic):  # numpy 标量（np.bool_/np.float32…）先降成 Python 原生值
        v = v.item()
    if isinstance(v, float):
        return None if (np.isnan(v) or np.isinf(v)) else round(float(v), 4)
    if isinstance(v, dict):
        return {k: json_safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [json_safe(x) for x in v]
    return v


def fmt_db(v) -> str:
    if v is None:
        return "inf"
    if isinstance(v, float) and np.isinf(v):
        return "inf"
    return f"{float(v):.2f}"


# ---------------------------------------------------------------- 单张处理
def process_one(entry: dict, args) -> dict:
    webp_rel = entry["webp"].replace("\\", "/")
    webp_path = ROOT / webp_rel
    orig_rel = entry["path"].replace("\\", "/")
    orig_path = ROOT / orig_rel
    mode = entry["mode"]
    alpha = mode == "RGBA"
    rel_gen = Path(webp_rel).relative_to("src/art/gen").as_posix()
    stem = rel_gen[:-5] if rel_gen.endswith(".webp") else rel_gen

    out = dict(
        stem=stem,
        webp=webp_rel,
        avif="src/art/gen/" + stem + ".avif",
        category=entry["category"],
        mode=mode,
        width=entry["width"],
        height=entry["height"],
        webp_bytes=entry["webp_bytes"],
        avif_bytes=None,
        webp_psnr=img_quality_metric(entry, alpha),
        avif_psnr=None,
        psnr_delta=None,
        quality=None,
        alpha_psnr=None,
        alpha_maxerr=None,
        converted=False,
        reason="",
        seconds=0.0,
        tried=[],
    )

    if not webp_path.exists():
        out["reason"] = "缺少 .webp"
        return out
    if not orig_path.exists():
        out["reason"] = "缺少母版，无法按同口径评估"
        return out

    src_im = Image.open(orig_path)
    src_im.load()
    src_im = src_im.convert("RGBA") if alpha else src_im.convert("RGB")
    src_arr = np.asarray(src_im)

    webp_metric = img_quality_metric(entry, alpha)
    t0 = time.time()
    best = None
    tried = []
    q = args.q_start_rgba if alpha else args.q_start_rgb
    while q <= args.q_max:
        data = encode(src_im, q, args.speed)
        m = measure(src_arr, data, alpha)
        gain = 1.0 - len(data) / entry["webp_bytes"] if entry["webp_bytes"] else 0.0
        ok_psnr = webp_metric is None or m["psnr_rgb"] >= webp_metric - args.tol
        ok_alpha = True
        if alpha:
            ok_alpha = (m["psnr_alpha"] >= args.alpha_psnr and m["alpha_maxerr"] <= args.alpha_maxerr)
        ok_gain = gain >= args.min_gain
        tried.append(dict(q=q, bytes=len(data), psnr=round(m["psnr_rgb"], 2), gain=round(gain, 4),
                          ok=ok_psnr and ok_alpha and ok_gain))
        if ok_psnr and ok_alpha and ok_gain:
            best = (q, data, m, gain)
            break
        q += args.q_step
    out["seconds"] = round(time.time() - t0, 2)
    out["tried"] = tried

    if best is None:
        last = tried[-1] if tried else None
        if last is not None and last["gain"] < args.min_gain:
            out["reason"] = "无体积收益（最高档仍为 %.1f%%）" % (last["gain"] * 100)
        elif last is not None and not last["ok"]:
            out["reason"] = "质量闸门未通过（PSNR/alpha）"
        else:
            out["reason"] = "未找到合适档位"
        return out

    q, data, m, gain = best
    out.update(
        avif_bytes=len(data),
        quality=q,
        avif_psnr=m["psnr_rgb"],
        psnr_delta=None if webp_metric is None else round(m["psnr_rgb"] - webp_metric, 2),
        alpha_psnr=None if not alpha else m["psnr_alpha"],
        alpha_maxerr=m["alpha_maxerr"] if alpha else 0,
        gain=round(gain, 4),
        converted=True,
    )
    if not args.dry_run:
        dst = ROOT / out["avif"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
    return out


# ---------------------------------------------------------------- 报告
def build_report(rows: list[dict], args) -> dict:
    converted = [r for r in rows if r["converted"]]
    skipped = [r for r in rows if not r["converted"]]
    webp_total = sum(r["webp_bytes"] for r in rows)
    webp_conv = sum(r["webp_bytes"] for r in converted)
    avif_total = sum(r["avif_bytes"] or 0 for r in converted)
    kept_webp = sum(r["webp_bytes"] for r in skipped)
    after = kept_webp + avif_total
    groups: dict[str, dict] = {}
    for r in rows:
        g = groups.setdefault(r["category"], dict(n=0, webp=0, avif=0, converted=0))
        g["n"] += 1
        g["webp"] += r["webp_bytes"]
        g["converted"] += 1 if r["converted"] else 0
        g["avif"] += r["avif_bytes"] or 0
    first = [r for r in rows if r["stem"] in FIRST_SCREEN]
    return dict(
        generatedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        settings=dict(speed=args.speed, tol=args.tol, minGain=args.min_gain,
                      qStartRgb=args.q_start_rgb, qStartRgba=args.q_start_rgba,
                      qStep=args.q_step, qMax=args.q_max,
                      alphaPsnr=args.alpha_psnr, alphaMaxErr=args.alpha_maxerr),
        totals=dict(images=len(rows), converted=len(converted), skipped=len(skipped),
                    webpTotal=webp_total, webpConverted=webp_conv, avifTotal=avif_total,
                    keptWebp=kept_webp, afterTotal=after, saved=webp_total - after,
                    savedRatio=round(1 - after / webp_total, 4) if webp_total else 0),
        groups={k: dict(n=v["n"], converted=v["converted"], webp=v["webp"], avif=v["avif"]) for k, v in groups.items()},
        firstScreen=[dict(stem=r["stem"], webp_bytes=r["webp_bytes"], avif_bytes=r["avif_bytes"],
                          saved=(r["webp_bytes"] - r["avif_bytes"]) if r["converted"] else 0,
                          converted=r["converted"]) for r in first],
        images=rows,
    )


def write_table(rep: dict) -> None:
    t = rep["totals"]
    st = rep["settings"]
    lines = []
    lines.append("# 美术素材 WebP → AVIF 对比（tools/optimize_art_avif.py 生成）\n")
    lines.append("生成时间：" + rep["generatedAt"] + "\n")
    lines.append("## 口径\n")
    lines.append("- 质量：PSNR 相对 **PNG/JPG 母版** 计算，与 webp_table.md 同口径；RGBA 图的 RGB 只统计 alpha>0 的像素（psnr_rgb_masked）。")
    lines.append("- 定档：从低 quality 往高试，取第一个满足「PSNR >= WebP PSNR - %.12g dB 且 alpha 达标（PSNR >= %.12g dB、最大误差 <= %.12g）且体积比 WebP 小 >= %.12g%%」的档位。" % (
        st["tol"], st["alphaPsnr"], st["alphaMaxErr"], round(st["minGain"] * 100, 1)))
    lines.append("- 不满足的图**不生成 .avif**，运行期继续走 .webp（见文末「未转换」）。")
    lines.append("")
    lines.append("## 汇总\n")
    lines.append("| 指标 | 数值 |")
    lines.append("| --- | --- |")
    lines.append("| 素材张数 | %d（转 %d / 不转 %d） |" % (t["images"], t["converted"], t["skipped"]))
    lines.append("| WebP 总体积 | %.2f MiB（%d B） |" % (t["webpTotal"] / 1048576, t["webpTotal"]))
    lines.append("| 转换后总体积（AVIF 图 + 保留的 WebP 图） | %.2f MiB（%d B） |" % (t["afterTotal"] / 1048576, t["afterTotal"]))
    lines.append("| 节省 | %.2f MiB（%.1f%%） |" % (t["saved"] / 1048576, t["savedRatio"] * 100))
    lines.append("")
    lines.append("## 首屏三张（标题画面）\n")
    lines.append("| 文件 | WebP | AVIF | 节省 | 降幅 |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    for r in rep["firstScreen"]:
        if r["converted"]:
            lines.append("| %s | %.1f KiB | %.1f KiB | %.1f KiB | %.1f%% |" % (
                r["stem"], r["webp_bytes"] / 1024, r["avif_bytes"] / 1024,
                r["saved"] / 1024, r["saved"] / r["webp_bytes"] * 100))
        else:
            lines.append("| %s | %.1f KiB | 未转 | - | - |" % (r["stem"], r["webp_bytes"] / 1024))
    fs_webp = sum(r["webp_bytes"] for r in rep["firstScreen"])
    fs_after = sum((r["avif_bytes"] if r["converted"] else r["webp_bytes"]) for r in rep["firstScreen"])
    lines.append("| **合计** | **%.1f KiB** | **%.1f KiB** | **%.1f KiB** | **%.1f%%** |" % (
        fs_webp / 1024, fs_after / 1024, (fs_webp - fs_after) / 1024, (fs_webp - fs_after) / fs_webp * 100))
    lines.append("")
    lines.append("## 分类小计\n")
    lines.append("| 分类 | 张数 | 转 | WebP | 转换后 | 省 |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    for name, g in rep["groups"].items():
        conv_webp = sum(r["webp_bytes"] for r in rep["images"] if r["category"] == name and r["converted"])
        after = g["webp"] - conv_webp + g["avif"]
        lines.append("| %s | %d | %d | %.0f KiB | %.0f KiB | %.0f KiB |" % (
            name, g["n"], g["converted"], g["webp"] / 1024, after / 1024, (g["webp"] - after) / 1024))
    lines.append("")
    lines.append("## 逐张明细\n")
    lines.append("| 文件 | 尺寸 | 模式 | WebP KiB | WebP PSNR | AVIF KiB | q | AVIF PSNR | dPSNR | 相对 WebP | 判定 |")
    lines.append("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for r in rep["images"]:
        rel = r["stem"]
        if r["converted"]:
            lines.append("| %s | %dx%d | %s | %.1f | %s | %.1f | %d | %s | %s | %.1f%% | PASS |" % (
                rel, r["width"], r["height"], r["mode"], r["webp_bytes"] / 1024, fmt_db(r["webp_psnr"]),
                r["avif_bytes"] / 1024, r["quality"], fmt_db(r["avif_psnr"]),
                ("n/a" if r["psnr_delta"] is None else "%+.2f" % r["psnr_delta"]),
                (1 - r["avif_bytes"] / r["webp_bytes"]) * 100))
        else:
            lines.append("| %s | %dx%d | %s | %.1f | %s | - | - | - | - | - | SKIP（%s） |" % (
                rel, r["width"], r["height"], r["mode"], r["webp_bytes"] / 1024, fmt_db(r["webp_psnr"]), r["reason"]))
    skipped = [r for r in rep["images"] if not r["converted"]]
    lines.append("")
    lines.append("## 未转换（保留 WebP）\n")
    if skipped:
        for r in skipped:
            lines.append("- " + r["stem"] + "：" + r["reason"])
    else:
        lines.append("- 无：全部有体积收益。")
    lines.append("")
    lines.append("## 备注\n")
    lines.append("- 母版 PNG/JPG 与 .webp 都不删除；.avif 只是新增的回退链最内层。")
    lines.append("- 运行期选择逻辑：src/art/img.js（默认 .avif，onerror 回退 .webp 一次；?noavif=1 强制 WebP）。")
    lines.append("- src/art/avif_manifest.js 由本脚本生成，运行期用它判断哪些图有 .avif，避免未转换的图吃 404。")
    TABLE.parent.mkdir(parents=True, exist_ok=True)
    TABLE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_manifest(rep: dict) -> None:
    stems = sorted(r["stem"] for r in rep["images"] if r["converted"])
    body = ["// 由 tools/optimize_art_avif.py 生成，勿手改。",
            "// 只有体积收益达标的图才登记在这里；运行期 src/art/img.js 据此决定是否请求 .avif，",
            "// 没转的图继续走 .webp，不会白白吃一次 404。",
            "export const AVIF_ASSETS = new Set(["]
    for s in stems:
        body.append("  " + json.dumps(s) + ",")
    body.append("]);")
    body.append("")
    MANIFEST.write_text("\n".join(body), encoding="utf-8")


# ---------------------------------------------------------------- 主流程
def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="src/art 的 .webp -> .avif（保留 .webp 回退）")
    ap.add_argument("--dry-run", action="store_true", help="只测量，不写盘")
    ap.add_argument("--only", default=None, help="只处理 stem 包含该子串的图")
    ap.add_argument("--list-only", action="store_true", help="只列文件")
    ap.add_argument("--speed", type=int, default=DEFAULTS["speed"], help="libavif speed（0 最慢/最小，10 最快）")
    ap.add_argument("--tol", type=float, default=DEFAULTS["tol"], help="允许的 PSNR 降幅（dB）")
    ap.add_argument("--min-gain", type=float, default=DEFAULTS["min_gain"], help="最小体积收益比例（0.08 = 8%%）")
    ap.add_argument("--q-start-rgb", type=int, default=DEFAULTS["q_start_rgb"])
    ap.add_argument("--q-start-rgba", type=int, default=DEFAULTS["q_start_rgba"])
    ap.add_argument("--q-step", type=int, default=DEFAULTS["q_step"])
    ap.add_argument("--q-max", type=int, default=DEFAULTS["q_max"])
    ap.add_argument("--alpha-psnr", type=float, default=DEFAULTS["alpha_psnr"])
    ap.add_argument("--alpha-maxerr", type=int, default=DEFAULTS["alpha_maxerr"])
    ap.add_argument("--no-report", action="store_true", help="不写 avif_report.json / avif_table.md")
    ap.add_argument("--no-manifest", action="store_true", help="不写 src/art/avif_manifest.js")
    args = ap.parse_args(argv)

    if not WEBP_REPORT.exists():
        print("缺少 tools/_opt/webp_report.json：先跑 tools/optimize_art_webp.py")
        return 1
    rep = json.loads(WEBP_REPORT.read_text(encoding="utf-8"))
    entries = list(rep["images"])
    if args.only:
        needle = args.only.replace("\\", "/")
        entries = [e for e in entries if needle in e["webp"].replace("\\", "/")]
    if not entries:
        print("没有匹配的素材")
        return 1
    if args.list_only:
        for e in entries:
            print(e["webp"])
        return 0

    print("素材目录 : " + str(GEN))
    print("待处理   : %d 张  |  模式: %s" % (len(entries), "DRY-RUN" if args.dry_run else "生成 .avif"))
    print("参数     : speed=%d tol=%.12gdB min_gain=%.12g%% q %d..%d/%d（RGBA 从 %d）alpha>=%.12gdB amax<=%d" % (
        args.speed, args.tol, args.min_gain * 100, args.q_start_rgb, args.q_max,
        args.q_step, args.q_start_rgba, args.alpha_psnr, args.alpha_maxerr))
    header = "文件                              尺寸      模式  webpKB  wPSNR   avifKB   q  aPSNR     d   收益  判定"
    print("\n" + header)
    print("-" * 100)

    rows = []
    for e in entries:
        r = process_one(e, args)
        rows.append(r)
        rel = r["stem"]
        if len(rel) > 33:
            rel = "..." + rel[-30:]
        if r["converted"]:
            print("%-34s%-10s%5s%8.1f%7s%8.1f%4d%7s%+6.2f%7.1f%%  PASS" % (
                rel, "%dx%d" % (r["width"], r["height"]), r["mode"], r["webp_bytes"] / 1024,
                fmt_db(r["webp_psnr"]), r["avif_bytes"] / 1024, r["quality"],
                fmt_db(r["avif_psnr"]), r["psnr_delta"] or 0,
                (1 - r["avif_bytes"] / r["webp_bytes"]) * 100))
        else:
            print("%-34s%-10s%5s%8.1f%7s%8s%4s%7s%6s%7s  SKIP（%s）" % (
                rel, "%dx%d" % (r["width"], r["height"]), r["mode"], r["webp_bytes"] / 1024,
                fmt_db(r["webp_psnr"]), "-", "-", "-", "-", "-", r["reason"]))

    report = build_report(rows, args)
    t = report["totals"]
    print("\n" + "=" * 100)
    print("分类小计：")
    for name, g in report["groups"].items():
        conv_webp = sum(r["webp_bytes"] for r in rows if r["category"] == name and r["converted"])
        after = g["webp"] - conv_webp + g["avif"]
        print("  %-22s%3d 张（转 %2d）%8.0f KiB -> %8.0f KiB  省 %7.0f KiB (%4.1f%%)" % (
            name, g["n"], g["converted"], g["webp"] / 1024, after / 1024,
            (g["webp"] - after) / 1024, (1 - after / max(g["webp"], 1)) * 100))
    print("  %-22s%3d 张（转 %2d）%8.0f KiB -> %8.0f KiB  省 %7.0f KiB (%4.1f%%)" % (
        "合计", t["images"], t["converted"], t["webpTotal"] / 1024, t["afterTotal"] / 1024,
        t["saved"] / 1024, t["savedRatio"] * 100))
    print("\n首屏三张：")
    for r in report["firstScreen"]:
        if r["converted"]:
            print("  %-18s%7.1f KiB -> %7.1f KiB  省 %6.1f KiB" % (
                r["stem"], r["webp_bytes"] / 1024, r["avif_bytes"] / 1024, r["saved"] / 1024))
        else:
            print("  %-18s%7.1f KiB -> 未转" % (r["stem"], r["webp_bytes"] / 1024))
    print("\n写入 %d 个 .avif，跳过 %d 张%s" % (
        t["converted"], t["skipped"], "（dry-run：未写盘）" if args.dry_run else ""))

    if not args.no_report:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(json_safe(report), ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
        write_table(report)
        print("报告：tools/_opt/avif_report.json / tools/_opt/avif_table.md")
    if not args.no_manifest and not args.dry_run:
        write_manifest(report)
        print("清单：src/art/avif_manifest.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
