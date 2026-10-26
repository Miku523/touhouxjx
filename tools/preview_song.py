#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/preview_song.py —— 把曲库里的某首曲子离线渲染成 WAV，供试听。

WebAudio 在浏览器里实时合成，命令行听不到，所以这里按 src/engine/audio.js
的同一套参数（波形、包络、各鼓的滤波/扫频、BGM 总线 0.9×0.8）用 numpy 复刻一遍。
差异只在「带限」：浏览器振荡器是带限的，这里用朴素波形 + 10kHz 一阶低通近似。

用法：
    python tools/preview_song.py --file src/engine/songs/preboss.js \
        --export PREBOSS_SONGS --key pre1 --loops 2 --out tools/build/pre1_preview.wav
"""

import argparse
import json
import os
import subprocess
import sys
import wave as wavemod

import numpy as np

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100


def load_song(path, export, key):
    """用 node 直接 import 曲库文件，导出 JSON（避免在 Python 里解析 JS）。"""
    p = os.path.abspath(path).replace('\\', '/')
    # export 可以是「{ key: song }」包装，也可以直接是单曲对象（带 duration 时）
    expr = ("import('file:///%s').then(m => { const e = m.%s;"
            " const s = (e && e.duration) ? e : (e && e['%s']);"
            " if (!s || !s.duration) { console.error('no such key'); process.exit(2); }"
            " process.stdout.write(JSON.stringify(s)); });"
            % (p, export, key))
    out = subprocess.run(['node', '--input-type=module', '-e', expr],
                         capture_output=True, cwd=ROOT)
    if out.returncode != 0:
        raise SystemExit('node 读取曲子失败: %s' % out.stderr.decode('utf-8', 'replace'))
    return json.loads(out.stdout.decode('utf-8'))


# ---------------------------------------------------------------- 基础波形
def wave(kind, phase):
    """phase 为 0..1 的相位数组。"""
    if kind == 'square':
        return np.where(phase < 0.5, 1.0, -1.0)
    if kind == 'triangle':
        return 4.0 * np.abs(phase - 0.5) - 1.0
    if kind == 'sawtooth':
        return 2.0 * phase - 1.0
    return np.sin(2.0 * np.pi * phase)


def exp_ramp(v0, v1, n):
    """WebAudio exponentialRampToValueAtTime 的等效：对数线性插值。"""
    if n <= 0:
        return np.zeros(0)
    return np.exp(np.linspace(np.log(v0), np.log(v1), n))


def env(n, attack_s, hold_s, dur_s, peak):
    """_musicNote 的包络：快速起音 → 保持 → 指数衰减到 1e-4。"""
    e = np.empty(n)
    a = max(1, int(attack_s * SR))
    h = max(a, int(hold_s * SR))
    h = min(h, n)
    d = n
    if a < h:
        e[:a] = exp_ramp(0.0001, peak, a)
        e[a:h] = peak
    else:
        e[:h] = peak
    tail = n - h
    if tail > 0:
        e[h:] = exp_ramp(peak, 0.0001, tail)
    return e


def noise_env(n, attack_s, dur_s, peak):
    """_noise 的包络：3ms 起音 → 指数衰减到 1e-4。"""
    a = max(1, int(attack_s * SR))
    a = min(a, n)
    e = np.empty(n)
    e[:a] = exp_ramp(0.0001, peak, a)
    if n > a:
        e[a:] = exp_ramp(peak, 0.0001, n - a)
    return e


# ---------------------------------------------------------------- 滤波器
def biquad_resp(kind, f0, q, freqs):
    """RBJ cookbook 双二阶的解析频率响应（用于 FFT 乘性滤波）。"""
    w0 = 2.0 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2.0 * q)
    cw = np.cos(w0)
    if kind == 'lowpass':
        b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    elif kind == 'highpass':
        b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    else:  # bandpass（常峰增益）
        b0, b1, b2 = alpha, 0.0, -alpha
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    z1 = np.exp(-1j * 2 * np.pi * freqs / SR)
    z2 = z1 * z1
    h = (b0 + b1 * z1 + b2 * z2) / (1.0 + a1 * z1 + a2 * z2)
    return np.abs(h)


def filtered_noise(kind, f0, q, dur, peak, attack=0.003):
    """白噪声 → FFT 乘滤波器响应 → 包络。"""
    n = max(1, int(dur * SR))
    x = np.random.uniform(-1.0, 1.0, n)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    H = biquad_resp(kind, f0, q, freqs)
    y = np.fft.irfft(np.fft.rfft(x) * H, n)
    y /= max(1e-9, np.max(np.abs(y)))
    return y * noise_env(n, attack, dur, peak)


def tone(f0, f1, dur, peak, kind='square', attack=0.012):
    """振荡器 + 包络（_musicNote 与 _tone 共用）。"""
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    if f1 is None or abs(f1 - f0) < 1e-9:
        freq = np.full(n, f0)
    else:
        freq = f0 * (f1 / f0) ** (t / max(dur, 1e-9))
    phase = np.cumsum(freq) / SR
    return wave(kind, phase % 1.0) * env(n, attack, max(attack, dur * 0.66), dur, peak)


# ---------------------------------------------------------------- 曲库事件
def add(buf, sig, at):
    i = int(round(at * SR))
    if i >= len(buf):
        return
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]


def drum_voice(kind, vel, gain):
    """对应 audio.js _scheduleDrum。返回 [(sig, )...] 直接叠加到总线上。"""
    v = (gain or 0.12) * (0.45 + 0.55 * (vel or 100) / 127.0)
    out = []
    if kind == 0:      # 底鼓：三角波 150→46Hz 下坠，110ms
        out.append(tone(150.0, 46.0, 0.11, min(0.2, v * 1.6), 'triangle', attack=0.004))
    elif kind == 1:    # 军鼓：带通噪声 + 一点方波
        out.append(filtered_noise('bandpass', 1550.0, 0.8, 0.11, min(0.14, v)))
        out.append(tone(220.0, 150.0, 0.05, min(0.06, v * 0.45), 'square', attack=0.004))
    elif kind == 2:    # 闭镲
        out.append(filtered_noise('highpass', 7800.0, 0.7, 0.028, min(0.07, v * 0.6), 0.003))
    elif kind == 3:    # 开镲
        out.append(filtered_noise('highpass', 6650.0, 0.7, 0.13, min(0.06, v * 0.5), 0.003))
    elif kind == 4:    # 吊镲
        out.append(filtered_noise('highpass', 4400.0, 0.6, 0.45, min(0.055, v * 0.4), 0.003))
    elif kind in (5, 6):  # 通鼓（仅 WAV 渲染器有，这里给个近似）
        f0 = 150.0 if kind == 6 else 105.0
        out.append(tone(f0, f0 * 0.55, 0.25, min(0.1, v * 0.8), 'triangle', attack=0.003))
    elif kind == 7:    # ride
        out.append(filtered_noise('highpass', 6000.0, 0.8, 0.5, min(0.035, v * 0.3), 0.002))
    return out


def warm_bus(x, sr=SR):
    """对应 audio.js _buildWarmBus：
    warmIn → 低通(5.2kHz, Q 0.6) ─┬→ 干声 0.95 → 总线
                                  └→ 反射 0.21s（反馈 0.15）→ 湿声 0.11 → 总线
    """
    n = len(x)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    xlow = np.fft.irfft(np.fft.rfft(x) * biquad_resp('lowpass', 5200.0, 0.6, freqs), n)

    d = max(1, int(0.21 * sr))
    fb = 0.15
    wet = np.zeros(n)
    m = 1
    while m * d < n:
        wet[m * d:] += (fb ** (m - 1)) * xlow[:n - m * d]
        m += 1
    return 0.95 * xlow + 0.11 * wet


def render(song, loops=2, tail=1.2):
    dur = float(song['duration'])
    total = dur * loops + tail
    buf = np.zeros(int(total * SR) + SR)
    for loop in range(loops):
        base = loop * dur
        for tr in song['tracks']:
            g = float(tr['gain'])
            for (t, midi, d, vel) in tr['notes']:
                if t >= dur:
                    continue
                d = max(0.03, min(float(d), 4.0))
                peak = max(0.0004, min(0.2, g * (0.4 + 0.6 * float(vel) / 127.0)))
                f = 440.0 * 2.0 ** ((float(midi) - 69.0) / 12.0)
                add(buf, tone(f, f, d, peak, tr['wave'], attack=min(0.012, d * 0.3)),
                    base + float(t))
        for ev in song.get('drums') or []:
            t, kind, vel = ev[0], ev[1], ev[2]
            if t >= dur:
                continue
            for sig in drum_voice(int(kind), int(vel), 0.12):
                add(buf, sig, base + float(t))

    # warm 曲目：复刻 audio.js 的温总线（5.2kHz 低通 + 0.21s 短反射）
    if song.get('warm'):
        buf = warm_bus(buf, sr=SR)

    # BGM 总线 0.9 × 音乐音量 0.8，再走一阶低通压一下朴素波形的高频毛刺
    x = buf * (0.9 * 0.8)
    a = 1.0 - np.exp(-2.0 * np.pi * 10000.0 / SR)
    y = np.empty_like(x)
    acc = 0.0
    # 用分段向量化近似一阶低通（避免 Python 逐样本循环）
    win = 256
    for i in range(0, len(x), win):
        chunk = x[i:i + win]
        k = np.arange(1, len(chunk) + 1)
        w = a * (1.0 - a) ** (k - 1)
        y[i:i + len(chunk)] = np.convolve(chunk, w, mode='full')[:len(chunk)] + acc * (1.0 - a) ** k
        acc = y[i + len(chunk) - 1]
    y = y - np.mean(y)
    # 尾巴淡出
    f = int(tail * SR)
    if f > 0 and len(y) > f:
        y[-f:] *= np.linspace(1.0, 0.0, f)
    peak = float(np.max(np.abs(y)))
    if peak > 0.98:
        y *= 0.98 / peak
    return y


def write_wav(path, y):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    data = np.clip(y * 32767.0, -32768, 32767).astype('<i2')
    with wavemod.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', required=True)
    ap.add_argument('--export', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--loops', type=int, default=2)
    ap.add_argument('--start', type=float, default=0.0, help='裁切起点（秒）')
    ap.add_argument('--seconds', type=float, default=0.0, help='裁切长度（秒，0=全曲）')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    song = load_song(args.file, args.export, args.key)
    print('曲子 %s: %s / %ss / bpm %s / %d 轨 / %d 鼓'
          % (args.key, song.get('title'), song['duration'], song.get('bpm'),
             len(song['tracks']), len(song.get('drums') or [])))
    y = render(song, loops=args.loops)
    if args.seconds > 0:
        i0 = int(args.start * SR)
        i1 = min(len(y), int((args.start + args.seconds) * SR))
        y = y[i0:i1].copy()
        f = int(0.4 * SR)
        if f > 0 and len(y) > f:
            y[-f:] *= np.linspace(1.0, 0.0, f)
    write_wav(args.out, y)
    print('写入 %s：%.1fs / %.1fMB' % (args.out, len(y) / SR, os.path.getsize(args.out) / 1048576.0))


if __name__ == '__main__':
    main()
