#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build/_exsr_render.py —— 「东方新纪行」band arrange 离线渲染器

把曲库曲目数据（src/engine/songs/*.js 里的一个可循环片段）按「同人 band arrange」
的音色模型渲染成一个 22.05kHz 单声道 PCM16 WAV：

  * 每轨按 name 选音色：
      lead / guitar / brass / strings / piano / harpsi / bass / pad /
      bell / tick / knife / arp / counter / riser / reverse
    name 缺失时回退到 wave 基础音色（square / triangle / sawtooth / sine）。
  * 鼓组按 kind 0..4 合成，比游戏内更厚（body + 独立 short room）。
  * 主奏/琶音/副旋律/钟/飞刀挂短 delay（1/8 拍，反馈 0.15）。
  * 2.5–3.5s 环形卷积大厅混响（湿声 0.18–0.28，只挂 180Hz 以上）。
  * 母线 tanh 软饱和 + 归一化到峰值 <= 0.55、RMS ~ -19.5dBFS（对齐 extra_mad.wav）。
  * 输出恰好 song.duration 秒（样本级精确）；所有缓冲、混响、delay 都是环形的，
    尾巴折回开头，循环接缝连续（src.loop = true 听不出断点）。

内部以 2 × 输出采样率（44100Hz）合成，再 2:1 抽取到 22050Hz，与 extra_mad.wav /
festival_box.wav 一致。

用法（正式曲）：
    python tools/build/_exsr_render.py --file src/engine/songs/sakuya_ex.js \
        --export SAKUYA_EX --key ex_pre --out src/assets/bgm/sakuya_ex.wav

调试 / 自检：
    --stems DIR      导出各声部干声（22.05kHz 单声道）供 selfcheck 分析
    --json PATH      把分析指标写成 JSON
    --no-reverb      不挂大厅混响
    --no-delay       不挂短 delay
    --wet / --drive / --peak / --rms / --seed 覆盖母带参数
"""
import argparse
import json
import os
import sys
import time

import numpy as np

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
if TOOLS not in sys.path:
    sys.path.insert(0, TOOLS)

import preview_song as ps  # noqa: E402

DEFAULT_OUT_SR = 22050
SR = 44100                      # 内部合成采样率 = 2 × 输出采样率
NOTE_MAX_RING = 10.0            # 单音最长余韵（秒），防止数据异常时爆内存

# 母带目标（与 extra_mad.wav 对齐）
TARGET_PEAK = 0.55
TARGET_RMS = -19.5
SAT_DRIVE = 1.6                   # tanh 驱动：本轮 120s 数据更密，1.3 会把 crest 推到 14.4（peak 0.55），
                                  # 1.6 压到 crest 13.1 / peak 0.48，听感只是更厚一点

# 大厅混响 / delay
HALL_LEN = 3.0
HALL_PREDELAY = 0.055
HALL_TAU = 0.82
HALL_DAMP = 0.60
HALL_WET = 0.22
ROOM_LEN = 0.80
ROOM_WET = 0.10
DELAY_DIV = 2.0                 # 1/8 拍
DELAY_MIX = 0.20
DELAY_FB = 0.15
DELAY_TAPS = 6
REV_CRASH_LEN = 1.20              # kind 8 reverse crash 的渐强时长（事件时间 = 骤停点）

# kick → bass 侧链：从 drums 的 kind 0 事件生成 ducking 包络，
# 只乘到 name=='bass' 的轨道缓冲上（深度 0.45 / 时间常数 0.10s，立即起音）。
SIDECHAIN_DEPTH = 0.45
SIDECHAIN_TAU = 0.10
SIDECHAIN_TRACK = 'bass'

# 母带校声：成品 WAV 比游戏内实时合成（preview_song）低频多 ~2.5dB、中频少 ~2.5dB，
# 用一条极缓的低架 + 中频 bell 把整体摆回「同人 band」而不是「低频糊脸」。
MASTER_LOW_DB = -2.0
MASTER_LOW_HZ = 120.0
MASTER_MID_DB = 2.0
MASTER_MID_HZ = 800.0
MASTER_MID_OCT = 1.9

# 高频架：只削 2-8kHz 的「刺」和镲片顶端，不动 800Hz 以下
MASTER_HIGH_DB = 0.0
MASTER_HIGH_HZ = 6000.0


# ============================================================ 基础工具
def nsamp(sec):
    """秒 → 样本数（按内部 44100Hz）。"""
    return max(1, int(round(float(sec) * SR)))


def midi_freq(m):
    return 440.0 * 2.0 ** ((float(m) - 69.0) / 12.0)


def db(x):
    return 20.0 * np.log10(max(float(x), 1e-12))


def circ_add(buf, sig, at):
    """把 sig 叠加到环形缓冲 buf 的 at 秒处，越界绕回开头（循环无损）。"""
    n = len(buf)
    if n <= 0 or len(sig) == 0:
        return
    i = int(round(float(at) * SR)) % n
    m = len(sig)
    if m > n:
        # 极长的音（几乎不会出现）：按环形折叠
        tmp = np.zeros(n, dtype=np.float64)
        idx = np.arange(m) % n
        np.add.at(tmp, idx, sig)
        sig, m, i = tmp, n, 0
    end = i + m
    if end <= n:
        buf[i:end] += sig
    else:
        k = n - i
        buf[i:] += sig[:k]
        buf[:end - n] += sig[k:]


def tail_fade(y, ms=12.0):
    """收尾淡出，保证音尾被截断时没有咔哒。"""
    k = min(len(y), int(ms * 1e-3 * SR))
    if k > 2:
        w = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, k))
        y[-k:] *= w
    return y


def tilt(x, fn):
    """零相位幅度整形（FFT，天然环形）。"""
    n = len(x)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    return np.fft.irfft(np.fft.rfft(x, n) * fn(f), n)


def filt(x, fn):
    """短噪声信号的单次滤波（用当前 SR）。"""
    n = len(x)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    return np.fft.irfft(np.fft.rfft(x) * fn(f), n)


def lp(f, fc, order=2):
    x = np.maximum(f, 0.0) / max(float(fc), 1e-6)
    return 1.0 / np.sqrt(1.0 + x ** (2 * order))


def hp(f, fc, order=2):
    x = np.maximum(f, 0.0) / max(float(fc), 1e-6)
    return x ** order / np.sqrt(1.0 + x ** (2 * order))


def bp(f, fc, q=1.0):
    """二阶带通幅度（峰 1）。"""
    x = np.maximum(f, 1e-6) / max(float(fc), 1e-6)
    return 1.0 / np.sqrt(1.0 + (float(q) * (x - 1.0 / x)) ** 2)


def bell(f, fc, width_oct, gain_db):
    """对数频率上的钟形搁架（gain_db 可正可负）。"""
    g = 10.0 ** (float(gain_db) / 20.0)
    x = np.log2(np.maximum(f, 1e-6) / max(float(fc), 1e-6))
    return 1.0 + (g - 1.0) * np.exp(-0.5 * (x / max(float(width_oct), 1e-3)) ** 2)


# ============================================================ 振荡器 / 包络
def _polyblep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    if m.any():
        x = ph[m] / dt[m]
        out[m] = x + x - x * x - 1.0
    m = ph > 1.0 - dt
    if m.any():
        x = (ph[m] - 1.0) / dt[m]
        out[m] = x * x + x + x + 1.0
    return out


def osc(kind, freq, phase0=0.0):
    """带限振荡器（saw/square 用 polyBLEP，triangle/sine 直接生成）。"""
    freq = np.clip(np.asarray(freq, dtype=np.float64), 0.5, SR * 0.49)
    dt = freq / SR
    ph = np.cumsum(freq) * (1.0 / SR) + float(phase0)
    ph -= np.floor(ph)
    if kind == 'sine':
        return np.sin(2.0 * np.pi * ph)
    if kind == 'triangle':
        return 4.0 * np.abs(ph - 0.5) - 1.0
    if kind == 'saw':
        return 2.0 * ph - 1.0 - _polyblep(ph, dt)
    if kind == 'square':
        return np.where(ph < 0.5, 1.0, -1.0) + _polyblep(ph, dt) \
            - _polyblep((ph + 0.5) % 1.0, dt)
    raise ValueError('unknown osc kind: %r' % (kind,))


def sustain_env(n, attack, dur, release, sustain=0.75, decay=0.55):
    """可持续音：平滑起音 → 指数衰减到 sustain → 音符结束后 release。"""
    t = np.arange(n, dtype=np.float64) / SR
    a = np.clip(t / max(float(attack), 1e-4), 0.0, 1.0)
    a = a * a * (3.0 - 2.0 * a)
    dec_t = max(0.04, float(dur) * float(decay))
    body = sustain + (1.0 - sustain) * np.exp(-np.maximum(0.0, t - attack) / dec_t)
    e = a * body
    m = t > float(dur)
    if m.any():
        rel = max(float(release), 0.008)
        e[m] *= np.exp(-(t[m] - float(dur)) / (rel * 0.30))
    return e


def perc_env(n, attack, tau):
    t = np.arange(n, dtype=np.float64) / SR
    e = np.exp(-t / max(float(tau), 0.005))
    a = np.clip(t / max(float(attack), 3e-4), 0.0, 1.0)
    return e * a * a * (3.0 - 2.0 * a)


def _vibrato(t, rate, depth, ramp=0.12, phase=0.0):
    gate = np.clip((t - float(ramp)) / 0.18, 0.0, 1.0)
    return 1.0 + float(depth) * np.sin(2.0 * np.pi * float(rate) * t + phase) * gate


def _ring(seconds):
    return nsamp(min(NOTE_MAX_RING, max(0.05, float(seconds))))


# ============================================================ 音色模型
def voice_lead(f0, dur, vel, rng):
    ring = dur + 0.20
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    vib = _vibrato(t, 5.3, 0.0028, ramp=0.13)
    drift = 1.0 + 0.0011 * np.sin(2.0 * np.pi * 0.7 * t + 0.4)
    f = f0 * vib * drift
    a = osc('saw', f * 2.0 ** (-7.0 / 1200.0), 0.0)
    b = osc('saw', f * 2.0 ** (7.0 / 1200.0), 0.31)
    c = osc('square', f * 2.0 ** (-3.0 / 1200.0), 0.62)
    y = 0.50 * a + 0.38 * b + 0.18 * c
    if f0 > 150.0:
        y = y + 0.14 * osc('square', f * 0.5, 0.20)
    y *= sustain_env(n, 0.009, dur, 0.15, sustain=0.72, decay=0.8)
    return tail_fade(y, 10.0)


def voice_guitar(f0, dur, vel, rng):
    ring = dur + 0.12
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    drift = 1.0 + 0.0008 * np.sin(2.0 * np.pi * 4.7 * t)
    f = f0 * drift
    a = osc('saw', f * 0.9945, 0.0)
    b = osc('saw', f * 1.0055, 0.47)
    c = osc('square', f, 0.13)
    y = 0.55 * a + 0.42 * b + 0.28 * c
    y = np.tanh(2.0 * y)          # 每个音的软削波 = 箱体/失真
    y *= sustain_env(n, 0.0035, dur, 0.07, sustain=0.60, decay=0.55)
    return tail_fade(y, 8.0)


def voice_brass(f0, dur, vel, rng):
    ring = dur + 0.20
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    vib = _vibrato(t, 4.8, 0.0018, ramp=0.18)
    f = f0 * vib
    y = np.zeros(n)
    for cents in (-8.0, -3.0, 3.0, 8.0):
        y += 0.26 * osc('saw', f * 2.0 ** (cents / 1200.0))
    y += 0.14 * osc('square', f * 2.0 ** (2.0 / 1200.0))
    y *= sustain_env(n, 0.040, dur, 0.14, sustain=0.82, decay=0.9)
    return tail_fade(y, 14.0)


def voice_strings(f0, dur, vel, rng):
    ring = dur + 0.50
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    vib = _vibrato(t, 4.3, 0.0012, ramp=0.30)
    f = f0 * vib
    y = np.zeros(n)
    for cents in (-11.0, -5.0, 0.0, 5.0, 11.0):
        y += 0.20 * osc('saw', f * 2.0 ** (cents / 1200.0))
    y += 0.18 * osc('triangle', f * 0.5)
    y *= sustain_env(n, 0.130, dur, 0.42, sustain=0.80, decay=1.1)
    return tail_fade(y, 20.0)


def voice_piano(f0, dur, vel, rng):
    tau = float(np.clip(0.95 * (261.63 / f0) ** 0.32, 0.22, 3.2))
    ring = max(0.45, dur * 1.15, tau * 2.6)
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    bright = 0.55 + 0.85 * float(vel) / 127.0
    parts = [(1, 1.00, 1.00), (2, 0.52, 0.78), (3, 0.30, 0.60),
             (4, 0.17, 0.46), (5, 0.095, 0.35), (6, 0.050, 0.27),
             (7, 0.025, 0.21)]
    y = np.zeros(n)
    for k, amp, dm in parts:
        fk = f0 * k * np.sqrt(1.0 + 0.00035 * k * k)
        if fk > SR * 0.47:
            continue
        a = amp * (bright if k >= 3 else 1.0)
        y += a * np.exp(-t / max(0.03, tau * dm)) * \
            np.sin(2.0 * np.pi * fk * t + rng.uniform(0.0, 0.25))
    # 击弦噪声：6ms 高频拨片
    m = min(n, nsamp(0.006))
    if m > 8:
        nz = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0013 * SR))
        nz = np.diff(np.concatenate([[0.0], nz]))
        y[:m] += 0.10 * nz[:m]
    y *= 1.0 - np.exp(-t / 0.0022)
    return tail_fade(y, 16.0)


def voice_harpsi(f0, dur, vel, rng):
    tau = float(np.clip(0.20 * (523.25 / f0) ** 0.25, 0.09, 0.55))
    ring = max(dur * 1.05, tau * 3.0)
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    parts = [(1, 1.00), (2, 0.62), (3, 0.40), (4, 0.26),
             (5, 0.17), (6, 0.11), (7, 0.07)]
    y = np.zeros(n)
    for k, amp in parts:
        fk = f0 * k * np.sqrt(1.0 + 0.0008 * k * k)
        if fk > SR * 0.45:
            continue
        y += amp * np.exp(-t / max(0.02, tau / (1.0 + 0.16 * (k - 1)))) * \
            np.sin(2.0 * np.pi * fk * t + rng.uniform(0.0, 0.3))
    m = min(n, nsamp(0.005))
    if m > 8:
        nz = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0011 * SR))
        y[:m] += 0.12 * np.diff(np.concatenate([[0.0], nz]))[:m]
    y *= 1.0 - np.exp(-t / 0.0009)
    return tail_fade(y, 10.0)


def voice_bass(f0, dur, vel, rng):
    ring = dur + 0.14
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    f = f0 * (1.0 + 0.014 * np.exp(-t / 0.035))
    y = 0.62 * osc('triangle', f) + 0.30 * osc('square', f) + \
        0.10 * osc('sine', f * 2.0)
    y = np.tanh(1.35 * y)
    y *= sustain_env(n, 0.006, dur, 0.10, sustain=0.55, decay=0.7)
    return tail_fade(y, 8.0)


def voice_pad(f0, dur, vel, rng):
    ring = dur + 0.70
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    atk = min(0.50, max(0.18, dur * 0.25))
    vib = _vibrato(t, 0.42, 0.0015, ramp=0.0)
    f = f0 * vib
    y = np.zeros(n)
    for cents in (-9.0, -4.0, 4.0, 9.0):
        y += 0.22 * osc('saw', f * 2.0 ** (cents / 1200.0))
    y += 0.30 * osc('sine', f) + 0.12 * osc('sine', f * 2.0)
    y *= sustain_env(n, atk, dur, 0.55, sustain=0.85, decay=3.0)
    return tail_fade(y, 24.0)


def voice_choir(f0, dur, vel, rng):
    """人声垫（choir）：多个微失谐锯齿 + 元音共振峰（a），慢起音、轻呼吸噪声。"""
    ring = dur + 0.65
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    atk = min(0.38, max(0.14, dur * 0.22))
    vib = _vibrato(t, 4.6, 0.0022, ramp=0.25)
    f = f0 * vib
    y = np.zeros(n)
    for cents in (-14.0, -6.0, 0.0, 7.0, 14.0):
        y += 0.175 * osc('saw', f * 2.0 ** (cents / 1200.0))
    y += 0.26 * osc('sine', f)
    # 呼吸/气声：慢包络的 1.1kHz 带通噪声
    breath = filt(rng.standard_normal(n), lambda ff: bp(ff, 1100.0, 0.9))
    y += 0.05 * breath
    # 元音共振峰（ah）：700 / 1250 / 2700Hz，只做幅度响应叠加
    y = filt(y, lambda ff: 0.60 * hp(ff, 130.0) * lp(ff, 5200.0) +
                          1.05 * bp(ff, 720.0, 1.7) +
                          0.75 * bp(ff, 1250.0, 2.2) +
                          0.32 * bp(ff, 2700.0, 2.6))
    y *= sustain_env(n, atk, dur, 0.55, sustain=0.86, decay=2.6)
    return tail_fade(y, 22.0)


def voice_bell(f0, dur, vel, rng):
    tau = float(np.clip(1.15 * (392.0 / f0) ** 0.28, 0.45, 3.4))
    ring = max(1.6, dur * 1.3)
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    parts = [(1.0, 1.00, 1.00), (2.01, 0.50, 0.60), (2.76, 0.42, 0.50),
             (5.40, 0.22, 0.32), (8.93, 0.10, 0.20)]
    y = np.zeros(n)
    for ratio, amp, dm in parts:
        fk = f0 * ratio
        if fk > SR * 0.46:
            continue
        y += amp * np.exp(-t / max(0.05, tau * dm)) * np.sin(2.0 * np.pi * fk * t)
    # FM 亮芯：高音数秒后只剩基频，打击瞬间是「铛」
    idx = 1.6 * np.exp(-t / 0.55)
    y += 0.18 * np.sin(2.0 * np.pi * f0 * t + idx * np.sin(2.0 * np.pi * f0 * 3.5 * t))
    y *= 1.0 - np.exp(-t / 0.0014)
    return tail_fade(y, 30.0)


def voice_tick(f0, dur, vel, rng):
    n = _ring(0.12)
    t = np.arange(n, dtype=np.float64) / SR
    nz = filt(rng.standard_normal(n), lambda f: hp(f, 3500.0, 2) * lp(f, 14000.0, 1))
    click = nz * np.exp(-t / 0.0045)
    fp = float(np.clip(f0 * 2.0, 1500.0, 5200.0))
    ping = np.sin(2.0 * np.pi * fp * t) * np.exp(-t / 0.030)
    y = 0.55 * click + 0.50 * ping
    y *= 1.0 - np.exp(-t / 0.0004)
    return tail_fade(y, 6.0)


def voice_knife(f0, dur, vel, rng):
    n = _ring(0.50)
    t = np.arange(n, dtype=np.float64) / SR
    nz1 = rng.standard_normal(n)
    nz2 = rng.standard_normal(n)
    m1 = filt(nz1, lambda f: bp(f, 6200.0, 2.2))
    m2 = filt(nz2, lambda f: bp(f, 3400.0, 1.6))
    metal = m1 * np.exp(-t / 0.055) + 0.7 * m2 * np.exp(-t / 0.090)
    fs = f0 * 3.0 * (0.45 ** (t / 0.22))
    sweep = np.sin(2.0 * np.pi * np.cumsum(fs) / SR) * np.exp(-t / 0.070)
    sweep *= np.clip(t / 0.006, 0.0, 1.0)
    y = 0.60 * metal + 0.40 * sweep
    return tail_fade(y, 8.0)


def voice_arp(f0, dur, vel, rng):
    tau = float(np.clip(0.22 * (440.0 / f0) ** 0.30, 0.10, 0.45))
    ring = max(dur * 1.1, tau * 3.2)
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    parts = [(1, 1.00), (2, 0.55), (3, 0.34), (4, 0.20), (5, 0.12)]
    y = np.zeros(n)
    for k, amp in parts:
        fk = f0 * k
        if fk > SR * 0.45:
            continue
        y += amp * np.exp(-t / max(0.02, tau / (1.0 + 0.22 * (k - 1)))) * \
            np.sin(2.0 * np.pi * fk * t + rng.uniform(0.0, 0.3))
    m = min(n, nsamp(0.004))
    if m > 8:
        nz = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0009 * SR))
        y[:m] += 0.10 * np.diff(np.concatenate([[0.0], nz]))[:m]
    y *= 1.0 - np.exp(-t / 0.0008)
    return tail_fade(y, 8.0)


def voice_counter(f0, dur, vel, rng):
    ring = dur + 0.18
    n = _ring(ring)
    t = np.arange(n, dtype=np.float64) / SR
    vib = _vibrato(t, 5.0, 0.0016, ramp=0.15)
    f = f0 * vib
    y = 0.42 * osc('square', f * 2.0 ** (-5.0 / 1200.0)) + \
        0.30 * osc('square', f * 2.0 ** (5.0 / 1200.0)) + \
        0.30 * osc('triangle', f * 0.5)
    y *= sustain_env(n, 0.014, dur, 0.14, sustain=0.78, decay=0.9)
    return tail_fade(y, 10.0)


def voice_riser(f0, dur, vel, rng):
    n = _ring(max(0.08, dur))
    t = np.arange(n, dtype=np.float64) / SR
    frac = np.clip(t / max(float(dur), 1e-3), 0.0, 1.0)
    f = f0 * 2.0 ** (2.4 * frac)
    y = 0.16 * osc('saw', f) + 0.12 * osc('saw', f * 1.005)
    nz = filt(rng.standard_normal(n), lambda ff: hp(ff, 1500.0, 2) * lp(ff, 13000.0, 2))
    amp = frac ** 1.7
    y = (0.35 * y + 0.65 * nz) * amp
    return tail_fade(y, 8.0)


def voice_reverse(f0, dur, vel, rng):
    n = _ring(max(0.06, dur))
    nz = filt(rng.standard_normal(n), lambda f: hp(f, 2600.0, 2) * lp(f, 14000.0, 2))
    env = (np.arange(n, dtype=np.float64) / max(n - 1, 1)) ** 2.1
    y = nz * env
    return tail_fade(y, 6.0)


def voice_wave(wave, f0, dur, vel, rng):
    """name 缺失时的回退音色：沿用引擎的四种基础波形 + 短包络。"""
    kind = {'sawtooth': 'saw', 'square': 'square',
            'triangle': 'triangle', 'sine': 'sine'}.get(wave, 'square')
    ring = max(0.05, dur) + 0.15
    n = _ring(ring)
    y = osc(kind, np.full(n, f0))
    y *= sustain_env(n, 0.012, dur, 0.12, sustain=0.80, decay=0.8)
    return tail_fade(y, 10.0)


VOICE_FN = {
    'lead': voice_lead, 'guitar': voice_guitar, 'brass': voice_brass,
    'strings': voice_strings, 'piano': voice_piano, 'harpsi': voice_harpsi,
    'bass': voice_bass, 'pad': voice_pad, 'bell': voice_bell,
    'tick': voice_tick, 'knife': voice_knife, 'arp': voice_arp,
    'counter': voice_counter, 'riser': voice_riser, 'reverse': voice_reverse,
    'choir': voice_choir,
}

# 声部电平配平（最终还会整体归一化，这里只决定相对平衡）
# 标定方法：单音 C4/vel100 时各 voice_* 输出峰值在 0.65~2.2 之间，而游戏内
# preview_song.tone() 的单音峰值 = gain*(0.4+0.6*vel/127)（上限 0.2）。取
# trim ≈ 1/单音峰值，让同一 gain 在 WAV 与实时合成里得到相同单音电平，
# Lead 按游戏内听感写的 gain 才能平移过来。长衰减声部（piano/bell）积分
# 能量天然更高，那属于谱面 gain 该负责的平衡，不在渲染器里补偿。
VOICE_TRIM = {
    'lead': 1.05, 'guitar': 1.05, 'brass': 1.25, 'strings': 1.42,
    'piano': 0.60, 'harpsi': 0.54, 'bass': 1.15, 'pad': 1.45,
    'bell': 0.48, 'tick': 0.92, 'knife': 1.05, 'arp': 0.62,
    'counter': 0.98, 'riser': 0.62, 'reverse': 0.46, 'choir': 1.30,
    'wave:square': 0.98, 'wave:triangle': 0.98,
    'wave:sawtooth': 0.95, 'wave:sine': 0.98,
}

# 声部音色整形（对整条声部总线做一次零相位 FFT 滤波）
SHAPES = {
    'lead': lambda f: hp(f, 130) * lp(f, 7600) * bell(f, 3000, 1.1, 1.5),
    'guitar': lambda f: hp(f, 100) * lp(f, 6500) * bell(f, 1200, 1.2, 5.0) * bell(f, 3400, 0.8, 2.0),
    'brass': lambda f: hp(f, 110) * lp(f, 7000) * bell(f, 1800, 1.2, 2.5),
    'strings': lambda f: hp(f, 130) * lp(f, 5600) * bell(f, 2600, 1.4, -1.0),
    'piano': lambda f: hp(f, 75) * lp(f, 8500) * bell(f, 3200, 1.6, 1.0),
    'harpsi': lambda f: hp(f, 200) * lp(f, 9000) * bell(f, 5000, 1.2, 2.0),
    'bass': lambda f: hp(f, 40) * lp(f, 1700) * bell(f, 85, 1.2, 4.0),
    'pad': lambda f: hp(f, 160) * lp(f, 4200) * bell(f, 700, 1.5, -1.0),
    'bell': lambda f: hp(f, 250) * lp(f, 11000),
    'tick': lambda f: hp(f, 3500) * lp(f, 13000),
    'knife': lambda f: hp(f, 2200) * lp(f, 13000) * bell(f, 6000, 1.0, 2.0),
    'arp': lambda f: hp(f, 260) * lp(f, 10000) * bell(f, 4200, 1.2, 1.5),
    'counter': lambda f: hp(f, 140) * lp(f, 6200) * bell(f, 2400, 1.2, 1.0),
    'choir': lambda f: hp(f, 150) * lp(f, 5200) * bell(f, 800, 1.5, 1.5),
    'riser': lambda f: hp(f, 300) * lp(f, 12000),
    'reverse': lambda f: hp(f, 1800),
    'wave:square': lambda f: hp(f, 80) * lp(f, 7000),
    'wave:sawtooth': lambda f: hp(f, 80) * lp(f, 7000),
    'wave:triangle': lambda f: hp(f, 70) * lp(f, 5500),
    'wave:sine': lambda f: hp(f, 50) * lp(f, 4000),
}

# 短 delay 只挂这些声部
DELAY_SEND = {'lead': 0.32, 'counter': 0.18, 'arp': 0.22, 'bell': 0.15, 'knife': 0.08}


# ============================================================ 鼓组
_HAT_PARTIALS = [6030.0, 7480.0, 8190.0, 9310.0, 10480.0, 11900.0, 13700.0, 15200.0]
_HAT_PHASES = [0.0, 1.1, 2.3, 3.7, 4.9, 5.6, 0.7, 2.9]
# kind 0-4 为曲库标准鼓（audio.js 回退也认），5+ 是只影响 WAV 的扩展鼓：
#   5=低音通鼓 6=高音通鼓 7=ride 8=reverse crash（事件时间=骤停点）9=军鼓滚奏（第 4 项=时长）
# 相对游戏内 drum_voice：整体约 1.5 倍厚（本 WAV 不走 warm_bus，需要自己补足存在感），
# 但底鼓不再压过旋律——游戏内 kick 峰值 ~0.115，这里 0.185≈1.6 倍。
KICK_BODY = 0.85                   # 底鼓 body 进 tanh 前的幅度（见 _synth_drum 注释）
DRUM_GAIN = {0: 0.185, 1: 0.120, 2: 0.068, 3: 0.058, 4: 0.052,
             5: 0.165, 6: 0.150, 7: 0.042, 8: 0.045, 9: 0.100}
DRUM_KINDS = tuple(sorted(DRUM_GAIN))
_DRUM_CACHE = {}


def _synth_drum(kind, rng):
    if kind == 0:                       # 底鼓：64Hz 正弦下坠 + 148Hz thump + beater click
        n = nsamp(0.50)
        t = np.arange(n, dtype=np.float64) / SR
        f = 64.0 + 104.0 * np.exp(-t / 0.030)
        body = np.sin(2.0 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.120)
        thump = 0.32 * np.sin(2.0 * np.pi * 148.0 * t) * np.exp(-t / 0.040)
        click = filt(rng.standard_normal(n), lambda ff: hp(ff, 2400.0, 2) * lp(ff, 9000.0, 2))
        click *= np.exp(-t / 0.0025)
        # body 系数 1.9 会一直压在 tanh 饱和区，底鼓只剩「一团低频」而瞬态被压平；
        # 0.85 让 kick 峰值在 tanh 的准线性区，body 幅度真实可调（-2dB 就真是 -2dB）。
        y = np.tanh(KICK_BODY * body + 0.80 * thump + 0.40 * click)
        # 46Hz 高通：去掉 20-63 段过多的次低频轰鸣（extra_mad 的 kick 基频只有 46Hz 且很轻）
        y = filt(y, lambda ff: hp(ff, 46.0, 2))
        y *= 1.0 - np.exp(-t / 0.0028)
    elif kind == 1:                     # 军鼓：带通噪声 + 体声 + 高频 crack
        n = nsamp(0.40)
        t = np.arange(n, dtype=np.float64) / SR
        crack = filt(rng.standard_normal(n), lambda ff: bp(ff, 2050.0, 0.9)) * np.exp(-t / 0.075)
        snap = filt(rng.standard_normal(n), lambda ff: hp(ff, 6000.0, 2)) * np.exp(-t / 0.038)
        body = 0.50 * np.sin(2.0 * np.pi * 187.0 * t) * np.exp(-t / 0.055) + \
            0.32 * np.sin(2.0 * np.pi * 281.0 * t) * np.exp(-t / 0.042)
        y = np.tanh(1.6 * (0.85 * crack + 0.55 * snap + body))
        y *= 1.0 - np.exp(-t / 0.0006)
    elif kind in (2, 3):                # 闭镲 / 开镲：金属正弦簇 + 高频噪声
        tau = 0.022 if kind == 2 else 0.155
        dur = 0.12 if kind == 2 else 0.45
        n = nsamp(dur)
        t = np.arange(n, dtype=np.float64) / SR
        metal = np.zeros(n)
        for fr, ph in zip(_HAT_PARTIALS, _HAT_PHASES):
            if fr < SR * 0.47:
                metal += np.sin(2.0 * np.pi * fr * t + ph)
        metal /= len(_HAT_PARTIALS)
        nz = filt(rng.standard_normal(n), lambda ff: hp(ff, 7200.0, 2))
        y = (0.32 * metal + 0.90 * nz) * np.exp(-t / tau)
        y *= 1.0 - np.exp(-t / 0.0003)
    elif kind == 4:                     # 吊镲：长金属噪声 + 高频簇
        n = nsamp(2.0)
        t = np.arange(n, dtype=np.float64) / SR
        nz = filt(rng.standard_normal(n), lambda ff: hp(ff, 3200.0, 2))
        shimmer = 1.0 + 0.30 * np.sin(2.0 * np.pi * 6.3 * t)
        metal = np.zeros(n)
        for fr, ph in zip(_HAT_PARTIALS, _HAT_PHASES):
            if fr < SR * 0.47:
                metal += np.sin(2.0 * np.pi * fr * t + ph * 0.5)
        metal /= len(_HAT_PARTIALS)
        y = 0.85 * nz * np.exp(-t / 0.75) * shimmer + 0.45 * metal * np.exp(-t / 0.55)
        y *= 1.0 - np.exp(-t / 0.001)
        y = tail_fade(y, 50.0)
    elif kind in (5, 6):                # 通鼓：低/高，正弦下坠 + 鼓皮噪声
        base, bend, tau = (92.0, 55.0, 0.24) if kind == 5 else (138.0, 70.0, 0.17)
        n = nsamp(0.70 if kind == 5 else 0.55)
        t = np.arange(n, dtype=np.float64) / SR
        f = base + bend * np.exp(-t / 0.055)
        body = np.sin(2.0 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
        skin = filt(rng.standard_normal(n), lambda ff: bp(ff, 420.0, 1.1)) * np.exp(-t / 0.030)
        y = np.tanh(1.7 * body + 0.55 * skin)
        y *= 1.0 - np.exp(-t / 0.0012)
    elif kind == 7:                     # ride：高频金属 ping + 短 wash
        n = nsamp(1.30)
        t = np.arange(n, dtype=np.float64) / SR
        ping = np.zeros(n)
        for fr, ph in [(2180.0, 0.3), (2870.0, 1.7), (3620.0, 0.9),
                       (4410.0, 2.4), (5270.0, 1.2), (6480.0, 0.1)]:
            ping += np.sin(2.0 * np.pi * fr * t + ph)
        ping /= 6.0
        wash = filt(rng.standard_normal(n), lambda ff: hp(ff, 4200.0, 2)) * np.exp(-t / 0.42)
        y = 0.55 * ping * np.exp(-t / 0.30) + 0.45 * wash
        y *= 1.0 - np.exp(-t / 0.0008)
        y = tail_fade(y, 30.0)
    elif kind == 8:                     # reverse crash：反向噪声 swell（事件时间 = 骤停点）
        n = nsamp(REV_CRASH_LEN)
        nz = filt(rng.standard_normal(n), lambda ff: hp(ff, 2800.0, 2) * lp(ff, 14000.0, 2))
        env = (np.arange(n, dtype=np.float64) / max(n - 1, 1)) ** 2.3
        y = nz * env
        y = tail_fade(y, 4.0)
    else:
        return np.zeros(1)
    pk = float(np.max(np.abs(y)))
    if pk > 1e-9:
        y = y / pk
    return y


def drum_hit(kind, rng):
    variants = _DRUM_CACHE.get(kind)
    if variants is None:
        variants = [_synth_drum(kind, np.random.default_rng(90210 + 7 * kind + i))
                    for i in range(6)]
        _DRUM_CACHE[kind] = variants
    y = variants[int(rng.integers(0, len(variants)))]
    return y * rng.uniform(0.94, 1.06)


DRUM_SHAPE = lambda f: hp(f, 30) * lp(f, 14000) * bell(f, 65, 1.2, 2.5) * bell(f, 3800, 1.0, -1.5)


# ============================================================ 混响 / delay
def hall_ir(length=HALL_LEN, predelay=HALL_PREDELAY, tau=HALL_TAU,
            damp=HALL_DAMP, seed=20261027):
    """空旷大厅：预延迟 + 稀疏早期反射 + 深而暗的扩散尾巴。"""
    rng = np.random.default_rng(seed)
    m = nsamp(length)
    t = np.arange(m, dtype=np.float64) / SR
    tail = rng.standard_normal(m) * np.exp(-t / tau)
    f = np.fft.rfftfreq(m, 1.0 / SR)
    H = (1.0 - damp) * lp(f, 3200.0, 1) + damp * lp(f, 1100.0, 1)
    tail = np.fft.irfft(np.fft.rfft(tail) * H, m)
    tail /= max(1e-9, float(np.max(np.abs(tail))))
    early = np.zeros(m)
    for ms, g in [(29.0, 0.50), (43.0, -0.40), (67.0, 0.33), (91.0, -0.25),
                  (127.0, 0.19), (163.0, -0.14)]:
        k = int(ms / 1000.0 * SR)
        if k < m:
            early[k] += g
    ir = 0.80 * tail + early
    pd = int(predelay * SR)
    if pd > 0:
        ir = np.concatenate([np.zeros(pd), ir])
    ir /= max(1e-9, float(np.sqrt(np.sum(ir * ir))))     # 单位能量
    return ir


def room_ir(length=ROOM_LEN, seed=77123):
    rng = np.random.default_rng(seed)
    m = nsamp(length)
    t = np.arange(m, dtype=np.float64) / SR
    tail = rng.standard_normal(m) * np.exp(-t / 0.22)
    f = np.fft.rfftfreq(m, 1.0 / SR)
    tail = np.fft.irfft(np.fft.rfft(tail) * lp(f, 4500.0, 1), m)
    tail /= max(1e-9, float(np.max(np.abs(tail))))
    early = np.zeros(m)
    for ms, g in [(7.0, 0.55), (13.0, -0.38), (23.0, 0.26), (31.0, -0.18)]:
        k = int(ms / 1000.0 * SR)
        if k < m:
            early[k] += g
    ir = 0.75 * tail + early
    ir /= max(1e-9, float(np.sqrt(np.sum(ir * ir))))
    return ir


def circ_conv(x, ir, n):
    """精确的环形卷积（FFT 长度 = n），尾巴自然折回开头。"""
    H = np.fft.rfft(ir, n)
    return np.fft.irfft(np.fft.rfft(x, n) * H, n)


def short_delay(x, n, bpm, mix=DELAY_MIX, fb=DELAY_FB, taps=DELAY_TAPS):
    """1/8 拍短 delay；用环形移位实现，回声尾巴折回开头。"""
    if bpm is None or bpm <= 0:
        bpm = 160.0
    d = int(round((60.0 / float(bpm)) / DELAY_DIV * SR))
    if d <= 0:
        return np.zeros(n)
    xd = tilt(x, lambda f: lp(f, 4200.0, 1) * hp(f, 180.0, 1))
    out = np.zeros(n)
    for k in range(1, taps + 1):
        out += (mix * fb ** (k - 1)) * np.roll(xd, k * d)
    return out


def antialias(x, sr, out_sr):
    """抽取前的砖墙低通：保到 0.92×输出奈奎斯特，锥形收到 0.995×。"""
    n = len(x)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    keep = out_sr * 0.5
    lo, hi = keep * 0.92, keep * 0.995
    H = np.ones_like(f)
    m_hi = f >= hi
    H[m_hi] = 0.0
    m_mid = (f > lo) & (~m_hi)
    if m_mid.any():
        H[m_mid] = 0.5 + 0.5 * np.cos(np.pi * (f[m_mid] - lo) / (hi - lo))
    return np.fft.irfft(np.fft.rfft(x) * H, n)


# ============================================================ 渲染
def resolve_voice(track, warnings):
    nm = track.get('name')
    if nm:
        nm = str(nm)
        if nm in VOICE_FN:
            return nm
        warnings.append('未知声部 name=%r，回退到 wave 基础音色' % nm)
    wave = str(track.get('wave') or 'square').lower()
    if wave not in ('square', 'triangle', 'sawtooth', 'sine'):
        warnings.append('未知 wave=%r，按 square 处理' % wave)
        wave = 'square'
    return 'wave:' + wave


def render_track(track, voice, n, dur, seed):
    buf = np.zeros(n, dtype=np.float64)
    g = float(track.get('gain') if track.get('gain') is not None else 0.10)
    trim = VOICE_TRIM.get(voice, 0.85)
    notes = track.get('notes') or []
    used = 0
    for j, nt in enumerate(notes):
        try:
            t0, midi, d = float(nt[0]), float(nt[1]), float(nt[2])
            vel = float(nt[3]) if len(nt) > 3 else 100.0
        except (TypeError, ValueError, IndexError):
            continue
        if t0 >= dur or t0 < 0.0:
            continue
        d = max(0.03, min(d, 4.0))
        f0 = midi_freq(midi)
        if not np.isfinite(f0) or f0 <= 0.0:
            continue
        amp = g * (0.4 + 0.6 * np.clip(vel, 0.0, 127.0) / 127.0) * trim
        rng = np.random.default_rng((seed + 2654435761 * (j + 1)) & 0xFFFFFFFF)
        if voice.startswith('wave:'):
            sig = voice_wave(voice[5:], f0, d, vel, rng)
        else:
            sig = VOICE_FN[voice](f0, d, vel, rng)
        circ_add(buf, sig * amp, t0)
        used += 1
    return buf, used


def dedupe_drums(drums):
    """同刻同 kind 的重复鼓事件合并为一次（取最大力度 / 最长滚奏）。

    编曲补丁常用「追加一个更高力度的同刻事件」来加力，留下同相位双重命中；
    两个相同鼓样本在同一采样点叠加会让该拍低频约 +6dB，并制造孤立尖峰。
    合并后等价于一次命中，返回 (events, merged_count)。
    """
    recs = {}
    order = []
    merged = 0
    for ev in drums or []:
        try:
            t0, kind = float(ev[0]), int(ev[1])
            vel = float(ev[2]) if len(ev) > 2 else 100.0
        except (TypeError, ValueError, IndexError):
            continue
        extra = None
        if len(ev) > 3 and ev[3] is not None:
            try:
                extra = float(ev[3])
            except (TypeError, ValueError):
                extra = None
        key = (t0, kind)
        rec = recs.get(key)
        if rec is not None:
            merged += 1
            rec[2] = max(rec[2], vel)
            if extra is not None:
                rec[3] = max(rec[3], extra) if len(rec) > 3 else extra
            continue
        out = [t0, kind, vel] if extra is None else [t0, kind, vel, extra]
        recs[key] = out
        order.append(out)
    return order, merged


def render_drums(drums, n, dur, seed, bpm=None, dedupe=True):
    buf = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(seed ^ 0x5EED)
    counts = {k: 0 for k in DRUM_KINDS}
    beat = 60.0 / float(bpm) if bpm else 0.375
    events, merged_dups = dedupe_drums(drums) if dedupe else (drums or [], 0)
    for ev in events:
        try:
            t0, kind, vel = float(ev[0]), int(ev[1]), float(ev[2])
            extra = float(ev[3]) if len(ev) > 3 else None
        except (TypeError, ValueError, IndexError):
            continue
        if kind not in DRUM_GAIN or t0 >= dur or t0 < 0.0:
            continue
        if kind == 9:                   # 军鼓滚奏：从 t0 起 span 秒，32 分音符渐强
            span = float(extra) if extra is not None else 0.60
            span = max(0.08, min(span, 4.0))
            step = beat / 8.0
            k = 0
            while True:
                tt = t0 + k * step
                if tt >= t0 + span - 1e-9 or tt >= dur:
                    break
                frac = (tt - t0) / span
                amp = DRUM_GAIN[1] * (0.45 + 0.55 * np.clip(vel, 0.0, 127.0) / 127.0)                     * (0.42 + 0.58 * frac)
                circ_add(buf, drum_hit(1, rng) * amp, tt)
                k += 1
            counts[9] += 1
            continue
        start = t0 - REV_CRASH_LEN if kind == 8 else t0
        if start >= dur:
            continue
        amp = DRUM_GAIN[kind] * (0.45 + 0.55 * np.clip(vel, 0.0, 127.0) / 127.0)
        circ_add(buf, drum_hit(kind, rng) * amp, start)   # 负起点由 circ_add 绕回尾部
        counts[kind] += 1
    return buf, counts, merged_dups


def kick_duck_env(drums, n, dur, depth=SIDECHAIN_DEPTH, tau=SIDECHAIN_TAU):
    """kick→bass 侧链包络：g(t) = 1 - depth*exp(-(t-tk)/tau)（t>=tk），循环折回。

    底鼓命中即开始 ducking（无 lookahead），相邻底鼓取较深的那条包络。
    """
    g = np.ones(n, dtype=np.float64)
    kicks = []
    for ev in drums or []:
        try:
            t0, kind = float(ev[0]), int(ev[1])
        except (TypeError, ValueError, IndexError):
            continue
        if kind == 0 and 0.0 <= t0 < float(dur):
            kicks.append(t0)
    if not kicks or depth <= 0.0 or tau <= 0.0:
        return g, 0
    L = min(n, max(8, int(round(6.0 * tau * SR))))
    dd = 1.0 - float(depth) * np.exp(-np.arange(L, dtype=np.float64) / (float(tau) * SR))
    idx_off = np.arange(L)
    for t0 in kicks:
        i = int(round(t0 * SR)) % n
        idx = (i + idx_off) % n
        g[idx] = np.minimum(g[idx], dd)
    return g, len(kicks)


def render_song(song, out_sr=DEFAULT_OUT_SR, wet=HALL_WET, drive=SAT_DRIVE,
                target_peak=TARGET_PEAK, target_rms=TARGET_RMS,
                use_reverb=True, use_delay=True, master_eq=True, seed=20261027,
                stems_dir=None, verbose=True, section_gain=None, sidechain=True,
                sidechain_depth=SIDECHAIN_DEPTH, sidechain_tau=SIDECHAIN_TAU,
                dedupe_drums_events=True):
    """渲染恰好一个循环（样本级精确），返回 dict。"""
    global SR
    SR = 2 * int(out_sr)
    sr = SR
    dur = float(song['duration'])
    n_out = int(round(dur * out_sr))
    n = 2 * n_out
    t_start = time.time()

    warnings = []
    bus = np.zeros(n, dtype=np.float64)
    delay_send = np.zeros(n, dtype=np.float64)
    drums_dry = np.zeros(n, dtype=np.float64)
    track_stats = []
    n_notes = 0

    sc_env = None
    sc_kicks = 0
    if sidechain:
        sc_env, sc_kicks = kick_duck_env(song.get('drums'), n, dur,
                                         depth=sidechain_depth, tau=sidechain_tau)

    for i, tr in enumerate(song.get('tracks') or []):
        voice = resolve_voice(tr, warnings)
        buf, used = render_track(tr, voice, n, dur, seed + i * 7919)
        n_notes += used
        shape = SHAPES.get(voice)
        if shape is not None:
            buf = tilt(buf, shape)
        ducked = bool(sidechain and voice == SIDECHAIN_TRACK and sc_env is not None)
        if ducked:
            buf = buf * sc_env
        bus += buf
        if voice in DELAY_SEND:
            delay_send += buf * DELAY_SEND[voice]
        track_stats.append({'index': i, 'name': voice,
                            'gain': float(tr.get('gain') or 0.0),
                            'notes': used, 'sidechain': ducked,
                            'rms_db': db(float(np.sqrt(np.mean(buf * buf)))) if used else -120.0})
        if stems_dir:
            write_stem(os.path.join(stems_dir, '%02d_%s.wav' % (i, voice.replace(':', ''))), buf, sr, out_sr)

    drums, drum_counts, drums_merged = render_drums(
        song.get('drums'), n, dur, seed, song.get('bpm'), dedupe=dedupe_drums_events)
    if drums_merged and verbose:
        print('[exsr] 同刻同 kind 重复鼓事件 %d 个：合并为单次命中（避免 +6dB 同相位叠加）'
              % drums_merged)
    if any(drum_counts.values()):
        drums = tilt(drums, DRUM_SHAPE)
        drums_dry = drums
        bus += drums

    n_drums = sum(drum_counts.values())
    n_notes += n_drums

    # 鼓组 short room：给 body 一点房间感，不拖进大混响
    if use_reverb and n_drums > 0:
        bus += ROOM_WET * circ_conv(drums_dry, room_ir(seed=seed + 31), n)

    # 1/8 短 delay（只从主奏/琶音等送）
    if use_delay and delay_send.any():
        bus += short_delay(delay_send, n, song.get('bpm'), mix=DELAY_MIX, fb=DELAY_FB)

    # 大厅混响（湿声只挂 180Hz 以上，低频留在干声里）
    dry_bus = bus
    if use_reverb:
        wet_sig = circ_conv(dry_bus, hall_ir(seed=seed), n)
        wet_sig = tilt(wet_sig, lambda f: hp(f, 190.0, 2))
        bus = dry_bus + float(wet) * wet_sig
    for arr in (delay_send, drums_dry):
        pass

    # ---- 母线：去直流 → 高通 → 软饱和 → 抗混叠 → 2:1 抽取
    bus -= float(np.mean(bus))
    bus = tilt(bus, lambda f: hp(f, 33.0, 2))
    if master_eq:
        g_low = 10.0 ** (MASTER_LOW_DB / 20.0)
        g_hi = 10.0 ** (MASTER_HIGH_DB / 20.0)
        bus = tilt(bus, lambda f: (g_low + (1.0 - g_low) * (1.0 - lp(f, MASTER_LOW_HZ))) *
                   bell(f, MASTER_MID_HZ, MASTER_MID_OCT, MASTER_MID_DB) *
                   (g_hi + (1.0 - g_hi) * (1.0 - lp(f, MASTER_HIGH_HZ))))
    pk0 = float(np.max(np.abs(bus)))
    if pk0 > 1e-9:
        bus = np.tanh(bus * (float(drive) / pk0)) / np.tanh(float(drive))
    pk1 = float(np.max(np.abs(bus)))
    bus = antialias(bus, sr, out_sr)
    y = 0.5 * (bus[0::2] + bus[1::2])
    if len(y) < n_out:
        y = np.concatenate([y, np.zeros(n_out - len(y))])
    y = y[:n_out]
    y -= float(np.mean(y))

    # ---- 可选的段平衡（mix 自动化）：在归一化前给指定时间段做增益，余弦斜坡避免爆音
    if section_gain:
        env = np.ones(n_out, dtype=np.float64)
        for a, b, gdb in section_gain:
            a = max(0.0, float(a))
            b = min(dur, float(b))
            if b <= a:
                continue
            g = 10.0 ** (float(gdb) / 20.0)
            ramp = min(0.4, 0.25 * (b - a))
            i0 = int(round(a * out_sr))
            i1 = int(round(b * out_sr))
            seg = np.full(max(0, i1 - i0), g, dtype=np.float64)
            nr = max(1, int(round(ramp * out_sr)))
            if len(seg) > 2 * nr:
                w = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, nr))
                # 相对增益：从当前基线 1.0 平滑过渡到 g（不能从 0 起，否则段首会静音 0.4s）
                seg[:nr] = 1.0 + (g - 1.0) * w
                seg[-nr:] = 1.0 + (g - 1.0) * w[::-1]
            env[i0:i1] *= seg
        y = y * env

    # ---- 母带归一化：同时满足峰值 <= target_peak 与 RMS ≈ target_rms
    pk = float(np.max(np.abs(y)))
    rms = float(np.sqrt(np.mean(y * y)))
    lim = 10.0 ** (float(target_rms) / 20.0)
    k = min(float(target_peak) / max(pk, 1e-9), lim / max(rms, 1e-9))
    y = y * k

    sm = seam_metrics(y, out_sr)
    seam = sm['seam']
    slope = sm['seam_slope_err']

    if stems_dir and drums_dry.any():
        write_stem(os.path.join(stems_dir, '90_drums.wav'), drums_dry, sr, out_sr)

    metrics = analyze(y, out_sr)
    out = {
        'song': song.get('title') or '',
        'duration': dur,
        'bpm': song.get('bpm'),
        'out_sr': int(out_sr),
        'samples': int(n_out),
        'samples_expected': int(round(dur * out_sr)),
        'peak': float(np.max(np.abs(y))),
        'rms_db': db(float(np.sqrt(np.mean(y * y)))),
        'pre_peak': pk0,
        'pre_peak_sat': pk1,
        'gain': float(k),
        'seam': seam,
        'seam_lf': sm['seam_lf'],
        'seam_pctile': sm['seam_pctile'],
        'seam_slope_err': slope,
        'seam_rms_ratio': seam / max(1e-9, float(np.sqrt(np.mean(y * y)))),
        'tracks': track_stats,
        'drums': {str(k2): int(v) for k2, v in drum_counts.items()},
        'drums_merged': int(drums_merged),
        'drums_events_data': int(len(song.get('drums') or [])),
        'drums_events_rendered': int(sum(drum_counts.values())),
        'notes': int(n_notes),
        'warnings': warnings,
        'render_sec': time.time() - t_start,
        'bands': metrics['bands'],
        'centroid_hz': metrics['centroid_hz'],
        'hf_db': metrics['hf_db'],
        'clips': metrics['clips'],
        'dc': metrics['dc'],
        'section_gain': [[float(a), float(b), float(g)] for a, b, g in (section_gain or [])],
        'kick_body': float(KICK_BODY),
        'master_eq': {'low_db': float(MASTER_LOW_DB), 'low_hz': float(MASTER_LOW_HZ),
                      'mid_db': float(MASTER_MID_DB), 'mid_hz': float(MASTER_MID_HZ),
                      'high_db': float(MASTER_HIGH_DB), 'high_hz': float(MASTER_HIGH_HZ)},
        'sidechain': {'enabled': bool(sidechain and sc_env is not None),
                      'target': SIDECHAIN_TRACK, 'src_kind': 0,
                      'depth': float(sidechain_depth), 'tau': float(sidechain_tau),
                      'kicks': int(sc_kicks)},
    }
    out['y'] = y
    return out


def write_stem(path, buf, sr, out_sr):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    x = antialias(buf, sr, out_sr)
    stem = 0.5 * (x[0::2] + x[1::2])
    # 不做逐轨归一化：保留各声部相对电平，selfcheck 才能比较声部能量
    import soundfile as sf
    sf.write(path, np.clip(stem * 32767.0, -32768, 32767).astype('<i2'), out_sr, subtype='PCM_16')


# ============================================================ 分析
BAND_EDGES = [20.0, 63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0, 22050.0]


def seam_metrics(y, sr):
    """循环接缝：样本级跳变、去高频后的跳变、以及该跳变在全曲相邻差分里的分位。"""
    y = np.asarray(y, dtype=np.float64)
    if len(y) < 4:
        return {'seam': 0.0, 'seam_lf': 0.0, 'seam_pctile': 0.0, 'seam_slope_err': 0.0}
    seam = abs(float(y[0]) - float(y[-1]))
    slope = abs((float(y[0]) - float(y[-1])) -
                0.5 * ((float(y[1]) - float(y[0])) + (float(y[-1]) - float(y[-2]))))
    yl = filt(y, lambda f: lp(f, 1000.0))
    seam_lf = abs(float(yl[0]) - float(yl[-1]))
    d = np.abs(np.diff(np.concatenate([y, y[:1]])))
    pct = 100.0 * float(np.mean(d <= seam))
    return {'seam': seam, 'seam_lf': seam_lf, 'seam_pctile': pct, 'seam_slope_err': slope}


def analyze(y, sr):
    y = np.asarray(y, dtype=np.float64)
    n = len(y)
    if n == 0:
        return {'bands': {}, 'centroid_hz': 0.0, 'hf_db': -120.0, 'clips': 0, 'dc': 0.0}
    w = np.hanning(n)
    spec = np.abs(np.fft.rfft(y * w))
    f = np.fft.rfftfreq(n, 1.0 / sr)
    p = spec * spec
    total = max(float(np.sum(p)), 1e-20)
    bands = {}
    for a, b in zip(BAND_EDGES[:-1], BAND_EDGES[1:]):
        m = (f >= a) & (f < b)
        bands['%g-%g' % (a, b)] = float(10.0 * np.log10(max(float(np.sum(p[m])), 1e-20) / total))
    cent = float(np.sum(f * p) / total)
    hf_mask = f >= 5000.0
    hf = float(10.0 * np.log10(max(float(np.sum(p[hf_mask])), 1e-20) / total))
    return {
        'bands': bands,
        'centroid_hz': cent,
        'hf_db': hf,
        'clips': int(np.sum(np.abs(y) >= 0.9999)),
        'dc': float(np.mean(y)),
    }


# ============================================================ CLI
def main():
    global KICK_BODY, MASTER_HIGH_DB
    ap = argparse.ArgumentParser(
        description='band arrange 离线渲染器：曲目数据 → 无缝循环 WAV')
    ap.add_argument('--file', required=True, help='曲目 js 文件')
    ap.add_argument('--export', required=True, help='导出常量名（如 SAKUYA_EX）')
    ap.add_argument('--key', required=True, help='曲目 key（如 ex_pre）')
    ap.add_argument('--out', required=True, help='输出 wav 路径')
    ap.add_argument('--sr', type=int, default=DEFAULT_OUT_SR, help='输出采样率（默认 22050）')
    ap.add_argument('--peak', type=float, default=TARGET_PEAK, help='峰值上限（默认 0.55）')
    ap.add_argument('--rms', type=float, default=TARGET_RMS, help='RMS 目标 dBFS（默认 -19.5）')
    ap.add_argument('--wet', type=float, default=HALL_WET, help='大厅湿声（默认 %.2f）' % HALL_WET)
    ap.add_argument('--drive', type=float, default=SAT_DRIVE, help='tanh 饱和驱动（默认 %.1f）' % SAT_DRIVE)
    ap.add_argument('--seed', type=int, default=20261027)
    ap.add_argument('--stems', default=None, help='导出各声部干声的目录（自检用）')
    ap.add_argument('--json', dest='json_path', default=None, help='指标 JSON 输出路径')
    ap.add_argument('--no-eq', action='store_true', help='关闭母带校声（低架 -2dB / 800Hz +2dB）')
    ap.add_argument('--no-sidechain', action='store_true', help='关闭 kick→bass 侧链')
    ap.add_argument('--keep-dups', action='store_true',
                    help='保留同刻同 kind 的重复鼓事件（默认合并，防止同相位 +6dB）')
    ap.add_argument('--kick-body', type=float, default=None,
                    help='底鼓 body 幅度（默认 %.2f，越小 63-125Hz 越轻）' % KICK_BODY)
    ap.add_argument('--high-db', type=float, default=None,
                    help='母带高频架 dB（默认 %.1f @%.0fHz）' % (MASTER_HIGH_DB, MASTER_HIGH_HZ))
    ap.add_argument('--sc-depth', type=float, default=SIDECHAIN_DEPTH, help='侧链深度（默认 0.45）')
    ap.add_argument('--sc-tau', type=float, default=SIDECHAIN_TAU, help='侧链时间常数秒（默认 0.10）')
    ap.add_argument('--no-reverb', action='store_true')
    ap.add_argument('--no-delay', action='store_true')
    ap.add_argument('--section-gain', action='append', default=[], metavar='START:END:DB',
                    help='段平衡（mix 自动化）：给 START-END 秒加 DB 增益，归一化前作用，'
                         '余弦 0.4s 斜坡；可重复，如 --section-gain 78:90:1.0')
    args = ap.parse_args()

    if args.kick_body is not None:
        KICK_BODY = float(args.kick_body)
        _DRUM_CACHE.clear()
    if args.high_db is not None:
        MASTER_HIGH_DB = float(args.high_db)

    section_gain = []
    for sg in args.section_gain:
        try:
            a, b, g = [float(x) for x in sg.split(':')]
        except ValueError:
            ap.error('--section-gain 需要 START:END:DB，例如 78:90:1.0')
        section_gain.append((a, b, g))

    import soundfile as sf

    if args.stems:
        os.makedirs(args.stems, exist_ok=True)
    song = ps.load_song(args.file, args.export, args.key)
    if not song or 'duration' not in song:
        raise SystemExit('读不到曲目数据：%s / %s / %s' % (args.file, args.export, args.key))

    res = render_song(song, out_sr=args.sr, wet=args.wet, drive=args.drive,
                      target_peak=args.peak, target_rms=args.rms,
                      use_reverb=not args.no_reverb, use_delay=not args.no_delay,
                      master_eq=not args.no_eq,
                      seed=args.seed, stems_dir=args.stems, verbose=True,
                      section_gain=section_gain,
                      sidechain=not args.no_sidechain,
                      sidechain_depth=args.sc_depth, sidechain_tau=args.sc_tau,
                      dedupe_drums_events=not args.keep_dups)
    y = res.pop('y')
    res['file'] = args.out
    res['source_file'] = args.file

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sf.write(args.out, np.clip(y * 32767.0, -32768, 32767).astype('<i2'),
             args.sr, subtype='PCM_16')

    if args.json_path:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_path)), exist_ok=True)
        with open(args.json_path, 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=2)

    print('')
    print('[exsr] %s' % (res['song'] or args.key))
    print('  时长 %.4fs → %d 样本 @%dHz（期望 %d）'
          % (res['duration'], res['samples'], res['out_sr'], res['samples_expected']))
    if res['bpm']:
        print('  bpm %s' % res['bpm'])
    print('  音符/鼓事件 %d，渲染耗时 %.1fs' % (res['notes'], res['render_sec']))
    print('  声部：%s' % ', '.join('%s×%d' % (t['name'], t['notes']) for t in res.get('tracks', []))
          if False else '')
    print('  鼓：kick %d / snare %d / hat %d / open %d / crash %d'
          % (res['drums'].get('0', 0), res['drums'].get('1', 0), res['drums'].get('2', 0),
             res['drums'].get('3', 0), res['drums'].get('4', 0)))
    if any(res['drums'].get(k, 0) for k in ('5', '6', '7', '8', '9')):
        print('  扩展鼓：tom %d/%d / ride %d / revCrash %d / roll %d'
              % (res['drums'].get('5', 0), res['drums'].get('6', 0), res['drums'].get('7', 0),
                 res['drums'].get('8', 0), res['drums'].get('9', 0)))
    print('  母线：峰值 %.3f → tanh(%.1f) → %.3f → 低通/抽取 → 电平 ×%.3f'
          % (res['pre_peak'], args.drive, res['pre_peak_sat'], res['gain']))
    print('  成品：峰值 %.3f / RMS %.1f dBFS / 削顶 %d'
          % (res['peak'], res['rms_db'], res['clips']))
    print('  接缝：|y0-y-1| = %.4f（滑差 %.4f，全曲分位 %.1f%%；<1kHz %.4f）'
          % (res['seam'], res['seam_rms_ratio'], res['seam_pctile'], res['seam_lf']))
    print('  频段(相对总能量)：%s'
          % '  '.join('%s %.1fdB' % (k, v) for k, v in res['bands'].items()))
    print('  谱心 %.0f Hz，5kHz 以上占比 %.1f dB' % (res['centroid_hz'], res['hf_db']))
    if res.get('section_gain'):
        print('  段平衡：%s' % ', '.join('%.1f-%.1fs %+.2fdB' % (a, b, g)
                                        for a, b, g in res['section_gain']))
    if res['warnings']:
        for w in res['warnings']:
            print('  [warn] %s' % w)
    print('  写入 %s  %.2fMB'
          % (args.out, os.path.getsize(args.out) / 1048576.0))


if __name__ == '__main__':
    main()
