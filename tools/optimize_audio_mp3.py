#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 src/assets/bgm 下的离线渲染 WAV 转成 MP3（22050Hz 单声道，等效 96kbps），
并写入 Xing/Info + LAME tag（gapless 元数据），使浏览器 decodeAudioData 解码后的
采样数/时长与原 WAV 完全一致 —— 循环播放（AudioBufferSourceNode.loop=true）时
接缝不出现静音空档或咔哒。

默认参数是 VBR mean 112（lameenc 实际输出 ~92kbps）：三首合计 5.32MB，体积与
CBR 96k 相当而码率分配更合理；想要严格 CBR 就 --mode cbr --bitrate 96（合计 5.56MB）。

为什么需要自己写 Xing/Info 帧
------------------------------
lameenc 1.9.0 只吐裸 MP3 帧，不写 Xing/Info 头，因此也没有 LAME tag 里的
encoder delay(576) / padding 信息。Chrome/Edge 的 decodeAudioData 走 FFmpeg
demuxer：识别 Info/Xing 头后会读 LAME tag 的 delay/padding 并做 gapless 修剪；
没有标签时，解码结果 = 音频 + 576 采样前导 + 尾部补齐（实测 120s 曲子多出
~0.07s），循环接缝每圈插一段静音 —— 对 BGM 是不可接受的。

实测（headless Edge / Edge 142, FFmpeg demuxer）行为
----------------------------------------------------
* LAME tag 的 delay/padding 位于 "LAME" 起始处 +21 字节（3 字节，12bit+12bit），
  不是 +22：标签里 "encoding flags + ATH type" 是同一个字节，"bitrate" 在其后。
* 解码后长度 = 576 * frames - delay - padding（frames 取标签里写的总帧数，
  含 Info 帧本身）。
* delay 直接决定开头保留多少采样：delay = 576 时解码输出第 0 个采样正是原
  WAV 的第 0 个采样（用脉冲/噪声互相关实测 lag=0）。
* 尾部 padding 存在下限 ~1105 采样（= 528 解码器延迟 + 576 编码器延迟 + 1），
  小于该值时按 1105 修剪；因此本脚本要求 padding >= 1105，必要时在源信号尾部
  补零再编码，把余量做大。

用法
----
  python tools/optimize_audio_mp3.py --dry-run   # 只编码/测量，不写盘
  python tools/optimize_audio_mp3.py             # 只处理缺失或比 wav 旧的 mp3
  python tools/optimize_audio_mp3.py --force     # 全部重编
  python tools/optimize_audio_mp3.py --json      # 机器可读报告
  python tools/optimize_audio_mp3.py --bitrate 112
  python tools/optimize_audio_mp3.py --only festival
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BGM = ROOT / "src" / "assets" / "bgm"

# 目标曲目（离线渲染产物，原 WAV 一律保留）
TRACKS = ("sakuya_ex", "flandre_devil", "festival_box", "remilia_septette", "youma_stage1")

# 母版不在 src/assets/bgm 的曲目（体积超过 Cloudflare Pages 单文件 25 MiB 上限，只发 MP3）
MASTERS = {"remilia_septette": ROOT / "tools" / "build" / "_remi_kit" / "remilia_septette_stereo.wav",
           "youma_stage1": ROOT / "tools" / "build" / "_rumia_kit" / "youma_stage1_stereo.wav"}

SR = 22050          # 离线渲染采样率（WAV 侧，MP3 不做重采样）
SPF = 576           # MPEG-1/2 Layer III 每帧采样数
DEFAULT_MODE = "vbr"     # 与 CBR 96k 体积/质量等效，但更省（实测 91.8kbps 均值）
DEFAULT_BITRATE = 112    # VBR 的 mean 目标；lameenc 实际落在 ~92kbps

# --- gapless 常量（用 headless Edge 实测标定，见文件头说明） -----------------
ENC_DELAY = 576     # LAME 编码器延迟；写进 tag，浏览器据此丢弃开头 576 采样
MIN_PAD = 1105      # 浏览器对 padding 的下限（528 + 576 + 1），低于它会少修剪
MAX_PAD = 4095      # LAME tag 里 padding 是 12bit

# Layer III 帧长：MPEG-1 = 144*br/sr（spf 1152），MPEG-2 LSF = 72*br/sr（spf 576）
def frame_len(bitrate_kbps: int, sr: int, pad_bit: int, mpeg1: bool = False) -> int:
    coef = 144 if mpeg1 else 72
    return coef * bitrate_kbps * 1000 // sr + pad_bit


# MPEG-2 / 2.5 Layer III 允许的码率（22050Hz 下只可能用到这一张表）
MPEG2_L3_BITRATES = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0)
# MPEG-1 Layer III 码率表（44100Hz 立体声）
MPEG1_L3_BITRATES = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0)


def fmt(sr: int, nch: int):
    """返回 (mpeg1, spf, side_bytes, bitrate_table)；支持 22050 单声道 / 44100 立体声。"""
    if sr == 44100:
        return True, 1152, (32 if nch == 2 else 17), MPEG1_L3_BITRATES
    if sr == 22050:
        return False, 576, (9 if nch == 1 else 17), MPEG2_L3_BITRATES
    raise SystemExit(f"不支持的采样率 {sr}（只支持 22050 / 44100）")


def frame_at(buf: bytes, i: int, sr: int = SR):
    """如果 buf[i:] 是一个合法 MPEG-2 Layer III 帧头，返回 (长度, 码率kbps)，否则 None。"""
    if i + 4 > len(buf) or buf[i] != 0xFF or (buf[i + 1] & 0xE0) != 0xE0:
        return None
    ver = (buf[i + 1] >> 3) & 0x3          # 3 = MPEG-1 (44100Hz)，2 = MPEG-2 (22050Hz)
    layer = (buf[i + 1] >> 1) & 0x3        # 1 = Layer III
    if ver not in (3, 2) or layer != 1:
        return None
    br_index = (buf[i + 2] >> 4) & 0xF
    sr_index = (buf[i + 2] >> 2) & 0x3
    mpeg1 = ver == 3
    br = (MPEG1_L3_BITRATES if mpeg1 else MPEG2_L3_BITRATES)[br_index]
    if not br or sr_index == 3:
        return None
    pad = (buf[i + 2] >> 1) & 1
    return frame_len(br, sr, pad, mpeg1), br


def read_wav(path: Path):
    with wave.open(str(path), "rb") as w:
        nch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        pcm = w.readframes(n)
    if sw != 2:
        raise SystemExit(f"{path.name}: 只支持 PCM16，实际 sampwidth={sw}")
    if not ((nch == 1 and sr == 22050) or (nch == 2 and sr == 44100)):
        raise SystemExit(f"{path.name}: 只支持 22050 单声道 / 44100 立体声，实际 {sr}Hz {nch}ch")
    if len(pcm) != n * nch * 2:
        raise SystemExit(f"{path.name}: 数据长度不符 {len(pcm)} != {n * nch * 2}")
    return sr, nch, n, pcm


# ------------------------------------------------------------------ 编码
def encode_mp3(pcm: bytes, bitrate: int, mode: str = "cbr", vbr_q=None,
               sr: int = SR, nch: int = 1) -> bytes:
    import lameenc  # 纯 python wheel，仓库内其它脚本也用它

    enc = lameenc.Encoder()
    enc.set_in_sample_rate(sr)
    enc.set_out_sample_rate(sr)
    enc.set_channels(nch)
    enc.set_quality(2)             # 2 = 最高质量档
    if mode == "vbr":
        enc.set_vbr(3)             # 3 = vbr_mtrh，LAME 质量最好的 VBR 算法
        if vbr_q is None:
            enc.set_vbr_mean_bitrate_kbps(bitrate)
        else:
            enc.set_vbr_quality(vbr_q)   # LAME -Vn：0 最好/~245k，9 最省
    else:
        enc.set_bit_rate(bitrate)  # CBR
    return enc.encode(pcm) + enc.flush()


def scan_frames(buf: bytes, sr: int = SR):
    """按 MPEG 帧头切帧（逐帧读码率，CBR/VBR 都适用），返回 [(offset, length), ...]。

    遇到非法字节就前跳重同步；尾部不足一帧的残余字节丢弃。
    """
    frames = []
    i = 0
    n = len(buf)
    while i + 4 <= n:
        h = frame_at(buf, i, sr)
        if h and i + h[0] <= n:
            frames.append((i, h[0]))
            i += h[0]
            continue
        i += 1
    return frames


# ------------------------------------------------------- Xing/Info + LAME tag
def build_info_frame(n_frames: int, total_bytes: int, delay: int, padding: int,
                     bitrate: int, mode: str = "cbr", frames=None,
                     sr: int = SR, nch: int = 1) -> bytes:
    """构造 1 个「空」MPEG 帧，承载 Info( Xing ) 头 + 36 字节 LAME tag。

    帧结构（MPEG-2 LSF mono）：4B 帧头 + 9B side info + 'Info' + flags/frames/
    bytes/toc/quality + LAME tag。总长等于普通音频帧（313B@96k）。
    """
    mpeg1, _spf, side, table = fmt(sr, nch)
    fl = frame_len(bitrate, sr, 0, mpeg1)
    f = bytearray(fl)
    br_index = table.index(bitrate)
    # 帧头：MPEG-1/2 Layer III / 无 CRC / 该码率 / sr_index 0（44100 或 22050）/ 无 padding
    f[0] = 0xFF
    f[1] = 0xFB if mpeg1 else 0xF3
    # 历史 mono 22050 路径的 Info 帧头固定写 0xA0（96k 标称，保持逐字节可复现）；
    # 44100 立体声按真实 VBR mean 码率表写。
    f[2] = (br_index << 4) if mpeg1 else (0xA0 if nch == 1 else (br_index << 4))
    f[3] = 0x44 if nch == 2 else 0xC4  # 立体声用 joint stereo；单声道 mono
    off = 4 + side                   # 跳过 side info（MPEG-2 mono=9 / stereo=17，MPEG-1 stereo=32）
    f[off:off + 4] = b"Xing" if mode == "vbr" else b"Info"
    off += 4
    f[off:off + 4] = struct.pack(">I", 0x0F)      # frames|bytes|toc|quality
    off += 4
    f[off:off + 4] = struct.pack(">I", n_frames)  # 总帧数（含本帧）
    off += 4
    f[off:off + 4] = struct.pack(">I", total_bytes)
    off += 4
    # seek TOC：用真实帧偏移算（VBR 下不能瞎写，否则外部播放器拖动会跳错位置）
    if frames:
        toc = []
        for i in range(100):
            fo = frames[min(len(frames) - 1, i * len(frames) // 100)][0]
            toc.append(min(255, int(255 * fo / max(1, total_bytes))))
        f[off:off + 100] = bytes(toc)
    off += 100
    f[off:off + 4] = struct.pack(">I", 0)         # quality
    off += 4

    L = bytearray(36)
    L[0:9] = b"LAME3.100"        # 'LAME' + 5 字符版本
    L[9] = (4 if mode == "vbr" else 1) << 4   # VBR method | tag revision 0
    L[10] = 0                    # lowpass（0 = 未写）
    L[11:15] = b"\x00" * 4       # peak
    L[15:17] = b"\x00" * 2       # radio replay gain
    L[17:19] = b"\x00" * 2       # audiophile replay gain
    L[19] = 0                    # encoding flags + ATH type（同一个字节！）
    L[20] = bitrate              # 标称码率（kbps）
    # 关键：encoder delay / padding 在 "LAME" 起始 +21，3 字节 12bit+12bit
    L[21:24] = struct.pack(">I", (delay << 12) | padding)[1:]
    L[24] = 0                    # misc
    L[25] = 0                    # mp3 gain
    L[26] = 0                    # surround info
    L[27:31] = struct.pack(">I", 0)   # music length（0 = 未写）
    L[31:33] = b"\x00\x00"       # music crc
    L[33:35] = b"\x00\x00"       # tag crc
    f[off:off + 36] = L
    return bytes(f)


def parse_info_frame(buf: bytes):
    """回读自己写的 Info/LAME tag，返回 (n_frames, total_bytes, delay, padding)。"""
    if len(buf) < 4 + 32 + 4 + 4:
        return None
    if buf[0] != 0xFF or (buf[1] & 0xE0) != 0xE0:
        return None
    ver = (buf[1] >> 3) & 0x3
    mode = (buf[3] >> 6) & 0x3
    nch = 1 if mode == 3 else 2
    if nch == 1:
        side = 17 if ver == 3 else 9
    else:
        side = 32 if ver == 3 else 17
    off = 4 + side
    magic = bytes(buf[off:off + 4])
    if magic not in (b"Info", b"Xing"):
        return None
    off += 4
    flags = struct.unpack(">I", buf[off:off + 4])[0]; off += 4
    n_frames = struct.unpack(">I", buf[off:off + 4])[0]; off += 4
    total = struct.unpack(">I", buf[off:off + 4])[0]; off += 4
    if flags & 0x04:
        off += 100
    if flags & 0x08:
        off += 4
    tag = bytes(buf[off:off + 36])
    delay = padding = None
    if tag[:4] == b"LAME":
        v = struct.unpack(">I", b"\x00" + tag[21:24])[0]
        delay, padding = v >> 12, v & 0xFFF
    return n_frames, total, delay, padding


# ------------------------------------------------------------------ 主流程
def build_track(wav: Path, bitrate: int, dry_run: bool, mode: str = "cbr", out_dir: str = "",
                vbr_q=None, out_name: str = ""):
    t0 = time.time()
    sr, nch, n_samples, pcm = read_wav(wav)
    src_bytes = wav.stat().st_size
    mpeg1, spf, _side, _table = fmt(sr, nch)

    attempts = []
    pad_zeros = 0
    for _ in range(6):
        data = pcm + b"\x00\x00" * (pad_zeros * nch)
        stream = encode_mp3(data, bitrate, mode, vbr_q, sr, nch)
        frames = scan_frames(stream, sr)
        if not frames:
            raise SystemExit(f"{wav.name}: 编码结果里找不到 MPEG 帧")
        s0, s1 = frames[0][0], frames[-1][0] + frames[-1][1]
        body = stream[s0:s1]
        n_frames = len(frames)
        # 尾部余量 = 编码覆盖的采样数 - 原曲采样数（浏览器会按 padding 修剪掉）
        slack = n_frames * spf - n_samples
        attempts.append({"pad_zeros": pad_zeros, "frames": n_frames, "slack": slack})
        if MIN_PAD <= slack <= MAX_PAD:
            break
        if slack > MAX_PAD:
            raise SystemExit(f"{wav.name}: 尾部余量 {slack} 超出 LAME tag 12bit 上限")
        # slack 太小：尾部补零再编一次，把余量做大
        pad_zeros += (MIN_PAD - slack) + 8
    else:
        raise SystemExit(f"{wav.name}: 补零重试后仍无法满足 padding >= {MIN_PAD}")

    # LAME tag 的 padding 需补上 spf-ENC_DELAY 的差：MPEG-2（spf=576）时就是 slack，
    # MPEG-1（spf=1152）时多 576，这样「解码长度 = 总帧采样 - delay - padding」才等于原曲长度。
    pad_tag = slack + (spf - ENC_DELAY)
    if pad_tag > 4095:
        raise SystemExit(f"{wav.name}: padding {pad_tag} 超出 12bit 上限")
    total = len(body) + frame_len(bitrate, sr, 0, mpeg1)
    info = build_info_frame(n_frames + 1, total, ENC_DELAY, pad_tag, bitrate, mode, frames, sr, nch)
    mp3 = info + body
    _stem = out_name or wav.stem
    out = (Path(out_dir) / f"{_stem}.mp3") if out_dir else wav.with_suffix(".mp3")
    elapsed = time.time() - t0

    rep = {
        "track": _stem,
        "wav": str(wav.relative_to(ROOT)).replace("\\", "/"),
        "mp3": (str(out.relative_to(ROOT)) if out.is_relative_to(ROOT) else str(out)).replace("\\", "/"),
        "mode": mode,
        "sample_rate": sr,
        "samples": n_samples,
        "duration_s": round(n_samples / sr, 6),
        "before_bytes": src_bytes,
        "after_bytes": len(mp3),
        "bitrate_kbps": round(len(mp3) * 8 / (n_samples / sr) / 1000, 2),
        "frames": n_frames + 1,
        "delay": ENC_DELAY,
        "padding": pad_tag,
        "padded_source_samples": pad_zeros,
        # 解码长度 = 576 * (tag 里的帧数, 含 Info 帧) - delay - padding
        "expected_decoded_samples": (n_frames + 1) * spf - ENC_DELAY - pad_tag,
        "attempts": attempts,
        "elapsed_s": round(elapsed, 2),
        "written": False,
    }
    if rep["expected_decoded_samples"] != n_samples:
        raise SystemExit(f"{wav.name}: 自检失败 期望解码 {n_samples} 实际 {rep['expected_decoded_samples']}")

    if not dry_run:
        out.write_bytes(mp3)
        rep["written"] = True
        # 回读校验
        got = parse_info_frame(out.read_bytes()[:512])   # LAME tag 在 Info 帧 offset 133
        if got is None or got[2] != ENC_DELAY or got[3] != pad_tag:
            raise SystemExit(f"{out.name}: 回读 tag 校验失败 {got}")
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description="src/assets/bgm WAV -> gapless MP3")
    ap.add_argument("--dry-run", action="store_true", help="只编码/测量，不写盘")
    ap.add_argument("--force", action="store_true", help="即使 mp3 已是最新也重编")
    ap.add_argument("--bitrate", type=int, default=DEFAULT_BITRATE, help=f"目标码率 kbps（默认 {DEFAULT_BITRATE}；CBR 96 也是可选方案，体积 5.56MB）")
    ap.add_argument("--mode", choices=("cbr", "vbr"), default=DEFAULT_MODE, help=f"vbr（默认）或 cbr")
    ap.add_argument("--vbr-q", type=int, default=None, help="VBR 质量档 0..9（给了就覆盖 --bitrate 的 mean 方式）")
    ap.add_argument("--out-dir", default="", help="输出目录（默认与 wav 同目录）")
    ap.add_argument("--only", default="", help="只处理名字含该子串的曲目")
    ap.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    ap.add_argument("--out", default="", help="报告 JSON 落盘路径（可空）")
    args = ap.parse_args(argv)

    reports = []
    for name in TRACKS:
        wav = BGM / f"{name}.wav"
        if not wav.exists():
            alt = MASTERS.get(name)
            if alt is not None and alt.exists():
                wav = alt
                print(f".. {name}: 母版不在仓库，用 {alt.relative_to(ROOT)}")
            else:
                print(f"!! 缺少 {wav}", file=sys.stderr)
                continue
        if args.only and args.only not in name:
            continue
        mp3 = (Path(args.out_dir) / f"{name}.mp3") if args.out_dir else (BGM / f"{name}.mp3")
        if (mp3.exists() and not args.force and not args.dry_run and not args.out_dir
                and mp3.stat().st_mtime >= wav.stat().st_mtime):
            print(f"= {name}: 已最新，跳过（--force 重编）")
            continue
        out_dir = args.out_dir or ("" if wav.parent == BGM else str(BGM))
        rep = build_track(wav, args.bitrate, args.dry_run, args.mode, out_dir, args.vbr_q, out_name=name)
        reports.append(rep)
        if not args.json:
            print(f"  {rep['track']:<14} {rep['mode']:<4} {rep['before_bytes']:>9,}B -> {rep['after_bytes']:>8,}B  "
                  f"{rep['bitrate_kbps']:>6.2f} kbps  {rep['duration_s']:>8.3f}s  "
                  f"{rep['samples']:,} 采样  delay={rep['delay']} pad={rep['padding']}"
                  + ("" if rep["written"] else "  [dry-run]"))

    if reports and not args.json:
        tb = sum(r["before_bytes"] for r in reports)
        ta = sum(r["after_bytes"] for r in reports)
        td = sum(r["duration_s"] for r in reports)
        print(f"  合计 {len(reports)} 首: {tb:,}B -> {ta:,}B ({ta / 1024 / 1024:.2f} MiB / "
              f"{ta / 1e6:.2f} MB)，平均 {ta * 8 / td / 1000:.2f} kbps，节省 {100 * (1 - ta / tb):.1f}%")
    if args.json:
        print(json.dumps(reports, ensure_ascii=False, indent=1))
    if args.out and reports:
        Path(args.out).write_text(json.dumps(reports, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
