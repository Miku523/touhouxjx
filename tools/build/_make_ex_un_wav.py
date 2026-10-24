# -*- coding: utf-8 -*-
"""
把 un_mad.js 渲染成 src/assets/bgm/extra_mad.wav —— 并挂一层「空旷大厅」环形混响。

为什么必须是环形卷积：audio.js 里 WAV 用 `src.loop = true` 无缝循环，
尾巴一旦被裁掉，接缝处就是一声爆音。这里用 FFT 循环卷积（不是线性卷积），
混响尾巴会自然折回开头，接缝处能量连续 —— 听起来像同一个空间在自我延续。

用法：python tools/build/_make_ex_un_wav.py
"""
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import preview_song as ps  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = ps.SR                      # 44100
OUT_SR = 22050                  # 与旧 extra_mad.wav 一致
SONG_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'un_mad.js')
OUT_WAV = os.path.join(ROOT, 'src', 'assets', 'bgm', 'extra_mad.wav')
TARGET_PEAK = 0.55
TARGET_RMS = -19.5


def render_dry(song):
    """按 audio.js 的合成链路渲染**恰好一个循环**，不做淡出（淡出会毁掉接缝）。"""
    dur = float(song['duration'])
    n = int(round(dur * SR))
    buf = np.zeros(n + SR, dtype=np.float64)
    for tr in song['tracks']:
        g = float(tr['gain'])
        wv = tr['wave']
        for (t, midi, d, vel) in tr['notes']:
            if t >= dur:
                continue
            d = max(0.03, min(float(d), 4.0))
            peak = max(0.0004, min(0.2, g * (0.4 + 0.6 * float(vel) / 127.0)))
            f = 440.0 * 2.0 ** ((float(midi) - 69.0) / 12.0)
            ps.add(buf, ps.tone(f, f, d, peak, wv, attack=min(0.012, d * 0.3)), float(t))
    for (t, kind, vel) in song.get('drums') or []:
        if t >= dur:
            continue
        for sig in ps.drum_voice(int(kind), int(vel), 0.12):
            ps.add(buf, sig, float(t))

    if song.get('warm'):
        buf = ps.warm_bus(buf, sr=SR)
    buf = buf[:n] * 0.72            # BGM 总线 0.9 × 音乐音量 0.8

    # 一阶低通压一下朴素波形的毛刺（循环频域做，天然环形）
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    H = ps.biquad_resp('lowpass', 10000.0, 0.7, freqs)
    buf = np.fft.irfft(np.fft.rfft(buf) * H, n)
    return buf - buf.mean()


def hall_ir(sr=SR, length=3.0, predelay=0.055, tau=0.78, damp=0.62):
    """空旷大厅：远预延迟 + 稀疏早期反射 + 深而暗的扩散尾巴。"""
    rng = np.random.default_rng(20241024)
    n = int(length * sr)
    t = np.arange(n) / sr
    env = np.exp(-t / tau)
    # 尾巴：暗噪声，越往后越暗（包络分段做二阶低通近似：模糊 + 长尾）
    tail = rng.standard_normal(n) * env
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    H = ps.biquad_resp('lowpass', 3400.0, 0.7, freqs) * (1.0 - damp) \
        + ps.biquad_resp('lowpass', 1200.0, 0.7, freqs) * damp
    tail = np.fft.irfft(np.fft.rfft(tail) * H, n)
    # 早期反射：离散抽头，左右交替相位
    early = np.zeros(n)
    for i, (ms, g) in enumerate([(29.0, 0.42), (43.0, -0.34), (67.0, 0.28),
                                 (91.0, -0.21), (127.0, 0.16), (163.0, -0.12)]):
        k = int(ms / 1000.0 * sr)
        if k < n:
            early[k] += g
    ir = tail / max(1e-9, np.sqrt(np.sum(tail ** 2)))
    ir = 0.92 * ir + early
    ir = np.concatenate([np.zeros(int(predelay * sr)), ir])
    ir /= max(1e-9, np.sqrt(np.sum(ir ** 2)))   # 单位能量，湿声电平可控
    return ir


def circular_reverb(x, ir, wet=0.22):
    n = len(x)
    m = len(ir)
    k = 1
    while k < n:
        k <<= 1
    X = np.fft.rfft(x, k)
    I = np.fft.rfft(ir, k)
    wetx = np.fft.irfft(X * I, k)[:n]           # 循环卷积：尾巴折回开头
    # 混响只挂中高频：低频留在干声里，免得整个大厅跟着贝斯一起轰
    freqs = np.fft.rfftfreq(n, 1.0 / ps.SR)
    wetx = np.fft.irfft(np.fft.rfft(wetx) * ps.biquad_resp('highpass', 190.0, 0.7, freqs), n)
    return x + wet * wetx


def main():
    song = ps.load_song(SONG_JS, 'UN_MAD', 'extra')
    print('渲染 %s / %ss' % (song.get('title'), song['duration']))
    dry = render_dry(song)
    ir = hall_ir()
    y = circular_reverb(dry, ir, wet=0.22)
    # 低频垫一下，别让混响把底鼓糊成一团
    freqs = np.fft.rfftfreq(len(y), 1.0 / SR)
    y = np.fft.irfft(np.fft.rfft(y) * ps.biquad_resp('highpass', 38.0, 0.7, freqs), len(y))
    # 软饱和：推到接近满刻度再 tanh，给高潮段一点咬合感（狂气）
    pk0 = float(np.max(np.abs(y)))
    y = y * (1.9 / max(1e-9, pk0))
    y = np.tanh(y) / np.tanh(1.9)
    # 归一化：峰值不超 TARGET_PEAK，同时把 RMS 压回 TARGET_RMS，别在游戏里比别的曲子响一截
    pk = float(np.max(np.abs(y)))
    rms = float(np.sqrt(np.mean(y * y)))
    lim = 10.0 ** (TARGET_RMS / 20.0)
    k = min(TARGET_PEAK / max(1e-9, pk), lim / max(1e-9, rms))
    y = y * k
    print('  峰值 %.3f → 饱和 %.3f → 峰值 %.3f / RMS %.1f dB'
          % (pk0, pk, float(np.max(np.abs(y))), 20.0 * np.log10(max(1e-9, np.sqrt(np.mean(y * y))))))

    # 2:1 抽取（平均两样本，自带抗混叠），然后裁到「样本级精确」的循环长度
    y = 0.5 * (y[0::2] + y[1::2])
    n_out = int(round(float(song['duration']) * OUT_SR))
    if len(y) < n_out:
        y = np.concatenate([y, np.zeros(n_out - len(y))])
    y = y[:n_out]

    seam = abs(float(y[-1]) - float(y[0]))
    print('  循环 %d 样本 = %.4fs，接缝跳变 %.4f（peak %.2f）'
          % (n_out, n_out / OUT_SR, seam, TARGET_PEAK))
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    data = np.clip(y * 32767.0, -32768, 32767).astype('<i2')
    sf.write(OUT_WAV, data, OUT_SR, subtype='PCM_16')
    print('写入 %s  %.1fMB' % (OUT_WAV, os.path.getsize(OUT_WAV) / 1048576.0))


if __name__ == '__main__':
    main()
