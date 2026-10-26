# -*- coding: utf-8 -*-
"""把 festival_notes.json 渲染成 src/assets/bgm/festival_box.wav —— 真八音盒。

为什么不能用 audio.js 的合成器：那里的包络是「保持 → 指数衰减」，四种波形只有
基频，做出来是电子铃声，不是八音盒。八音盒的齿是钢片：一击之后按自己的模态
自由衰减，泛音比 1 : 2 : 3.01 : 4.06 …，高次泛音衰减更快，音越高尾巴越短。
这里按这个模型逐音合成，再挂一层比 EX 曲更长更暗的环形大厅混响（FFT 循环卷积，
尾巴折回开头，`src.loop = true` 循环时接缝连续）。

用法：python tools/build/_make_festival_wav.py
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import preview_song as ps  # noqa: E402
from _make_ex_un_wav import hall_ir, circular_reverb  # noqa: E402

SR = ps.SR                     # 44100
OUT_SR = 22050                 # 与 extra_mad.wav 一致
SRC_JSON = os.path.join(HERE, 'festival_notes.json')
OUT_WAV = os.path.join(ROOT, 'src', 'assets', 'bgm', 'festival_box.wav')
TARGET_PEAK = 0.50
TARGET_RMS = -20.0             # 比 EX 曲轻一点：八音盒不抢戏

# 每种声部：增益、基础衰减（秒）、泛音（频率比, 振幅, 衰减倍率）
VOICES = {
    'lead':  dict(gain=1.00, tau=1.15,
                  parts=[(1.0, 1.00, 1.00), (2.0, 0.40, 0.62), (3.01, 0.22, 0.46),
                         (4.06, 0.13, 0.34), (5.62, 0.075, 0.24), (7.10, 0.045, 0.17),
                         (9.20, 0.026, 0.12), (11.50, 0.014, 0.09)]),
    'bass':  dict(gain=0.35, tau=1.10, ringmax=2.2,
                  parts=[(1.0, 1.00, 1.00), (2.0, 0.28, 0.55), (3.00, 0.13, 0.36),
                         (4.00, 0.070, 0.24), (5.60, 0.035, 0.16)]),
    'harm':  dict(gain=0.36, tau=1.40,
                  parts=[(1.0, 1.00, 1.00), (2.0, 0.34, 0.56), (3.02, 0.17, 0.38),
                         (4.05, 0.090, 0.26), (5.60, 0.050, 0.18)]),
    'pad':   dict(gain=0.50, tau=2.20,
                  parts=[(1.0, 1.00, 1.00), (2.0, 0.26, 0.60), (3.01, 0.10, 0.40)]),
    'arp':   dict(gain=0.26, tau=1.00,
                  parts=[(1.0, 1.00, 1.00), (2.0, 0.34, 0.52), (3.02, 0.16, 0.32),
                         (4.06, 0.08, 0.22)]),
    'glass': dict(gain=0.42, tau=0.85,
                  parts=[(1.0, 1.00, 1.00), (2.76, 0.40, 0.38), (5.40, 0.20, 0.22),
                         (8.93, 0.09, 0.14)]),
    'spark': dict(gain=0.42, tau=0.90,
                  parts=[(1.0, 1.00, 1.00), (2.01, 0.38, 0.46), (3.03, 0.20, 0.30),
                         (4.10, 0.10, 0.20), (5.60, 0.05, 0.14)]),
}
RING_MAX = 4.4                 # 单音最长余韵（秒）
                                 # 低音单独限 2.4s：否则八分音符的贝斯会层层叠成糊


def box_tone(f0, tau, parts, sr=SR, ring_cap=RING_MAX):
    """一个八音盒齿被拨响的波形：击弦噪声 + 若干自由衰减的泛音。"""
    ring = min(ring_cap, tau * 3.4)
    n = max(64, int(ring * sr))
    t = np.arange(n, dtype=np.float64) / sr
    y = np.zeros(n)
    for (ratio, amp, dmul) in parts:
        f = f0 * ratio
        if f > sr * 0.47:
            continue
        y += amp * np.exp(-t / max(0.03, tau * dmul)) * np.sin(2.0 * np.pi * f * t)
    # 2ms 击弦：一小撮被压窄的高频噪声
    m = min(n, int(0.006 * sr))
    if m > 8:
        rng = np.random.default_rng(int(f0 * 1000) & 0xffff)
        click = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0012 * sr))
        # 带通：二次差分当高通 + 一次滑动平均当低通，落在 3.5k~9k
        click = np.diff(np.diff(np.concatenate([[0.0, 0.0], click])))
        click = np.convolve(click, np.ones(3) / 3.0, mode='same')
        y[:m] += 0.16 * click[:m]
    # 起音 1.2ms，别让波形在 0 处直接跳起来（会听见咔哒）
    y *= 1.0 - np.exp(-t / 0.0012)
    return y


def render(notes_by_voice, duration):
    n = int(round(duration * SR))
    buf = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(20261027)
    total = 0
    for vname, notes in notes_by_voice.items():
        cfg = VOICES[vname]
        cache = {}
        for (t, midi, _dur, vel) in notes:
            tau = cfg['tau'] * (67.0 / float(midi)) ** 0.30
            tau = float(np.clip(tau, 0.40, 4.0))
            key = int(midi)
            sig = cache.get(key)
            if sig is None:
                f0 = 440.0 * 2.0 ** ((float(midi) - 69.0) / 12.0)
                sig = box_tone(f0, tau, cfg['parts'], ring_cap=cfg.get('ringmax', RING_MAX))
                cache[key] = sig
            amp = cfg['gain'] * (0.45 + 0.55 * float(vel) / 127.0)
            amp *= float(rng.uniform(0.90, 1.10))            # 机械误差
            start = float(t) + float(rng.uniform(-0.008, 0.008))
            i0 = int(round(start * SR))
            m = len(sig)
            if i0 < 0:
                sig = sig[-i0:]
                i0 = 0
                m = len(sig)
            if i0 >= n:
                continue
            # 越界的余韵绕回开头：循环接缝处就是「上一遍还在响」的延续
            k = min(m, n - i0)
            buf[i0:i0 + k] += amp * sig[:k]
            if k < m:
                r = min(m - k, n)
                buf[:r] += amp * sig[k:k + r]
            total += 1
        cache.clear()
    return buf, total


def main():
    with open(SRC_JSON, encoding='utf-8') as f:
        model = json.load(f)
    duration = float(model['duration'])
    print('渲染《%s》%s BPM / %.3fs / %d 声部'
          % (model['title'], model['bpm'], duration, len(model['voices'])))

    dry, total = render(model['voices'], duration)
    print('  合成 %d 音，缓冲 %d 样本' % (total, len(dry)))

    # 大厅：比 EX 曲更长、更暗、湿声更多 —— 「祭典散了，房间还亮着」
    ir = hall_ir(SR, length=4.0, predelay=0.085, tau=1.18, damp=0.58)
    y = circular_reverb(dry, ir, wet=0.38)
    freqs = np.fft.rfftfreq(len(y), 1.0 / SR)
    y = np.fft.irfft(np.fft.rfft(y) * ps.biquad_resp('highpass', 44.0, 0.7, freqs), len(y))
    # 轻微高频收敛：八音盒的钢齿不该像电子铃那样尖
    y = np.fft.irfft(np.fft.rfft(y) * ps.biquad_resp('lowpass', 12000.0, 0.6, freqs), len(y))

    pk0 = float(np.max(np.abs(y)))
    y = y * (1.6 / max(1e-9, pk0))
    y = np.tanh(y) / np.tanh(1.6)                  # 软饱和，只压峰值不动动态

    pk = float(np.max(np.abs(y)))
    rms = float(np.sqrt(np.mean(y * y)))
    lim = 10.0 ** (TARGET_RMS / 20.0)
    k = min(TARGET_PEAK / max(1e-9, pk), lim / max(1e-9, rms))
    y = y * k
    print('  峰值 %.3f → 饱和 %.3f → 峰值 %.3f / RMS %.1f dB'
          % (pk0, pk, float(np.max(np.abs(y))), 20.0 * np.log10(max(1e-9, np.sqrt(np.mean(y * y))))))

    # 抗混叠后 2:1 抽取到 22050
    freqs = np.fft.rfftfreq(len(y), 1.0 / SR)
    y = np.fft.irfft(np.fft.rfft(y) * ps.biquad_resp('lowpass', 9500.0, 0.75, freqs), len(y))
    y = 0.5 * (y[0::2] + y[1::2])
    n_out = int(round(duration * OUT_SR))
    if len(y) < n_out:
        y = np.concatenate([y, np.zeros(n_out - len(y))])
    y = y[:n_out]

    seam = abs(float(y[-1]) - float(y[0]))
    print('  循环 %d 样本 = %.3fs，接缝跳变 %.4f' % (n_out, n_out / OUT_SR, seam))
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    data = np.clip(y * 32767.0, -32768, 32767).astype('<i2')
    sf.write(OUT_WAV, data, OUT_SR, subtype='PCM_16')
    print('写入 %s  %.1fMB' % (OUT_WAV, os.path.getsize(OUT_WAV) / 1048576.0))


if __name__ == '__main__':
    main()
