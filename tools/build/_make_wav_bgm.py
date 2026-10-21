# -*- coding: utf-8 -*-
"""把离线渲染的 WAV 裁成游戏循环长度，降采样到 22.05kHz 单声道 16bit，供 WebAudio fetch 播放。"""
import sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
src, out, dur = sys.argv[1], sys.argv[2], float(sys.argv[3])
x, sr = sf.read(src, always_2d=True)
x = x.mean(axis=1)
n = int(round(dur * sr))
x = x[:n]
x = np.append(x, np.zeros(max(0, n - len(x))))
# FFT 低通 10kHz 后二分抽取 → 22.05kHz
X = np.fft.rfft(x)
f = np.fft.rfftfreq(len(x), 1.0 / sr)
X[f > 10000] *= 0.0
y = np.fft.irfft(X, len(x))[::2]
sf.write(out, y, sr // 2, subtype='PCM_16')
print('%s → %s：%.2fs / %d Hz / %.2f MB / peak %.3f' % (src, out, len(y) / (sr / 2), sr // 2,
      len(y) * 2 / 1048576, np.abs(y).max()))
