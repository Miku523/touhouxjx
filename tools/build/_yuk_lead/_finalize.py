# -*- coding: utf-8 -*-
"""yukari_ph 母版收尾：
#1 2kHz 以上 +4.5dB 亮度倾斜（900-1800Hz 过渡）
#2 引子 0-8.372s / 尾声 168.14-end 各 +4dB
#3 段间电平修正（母带 sat 把段差压平了，这里按音乐意图把落差找回来）
#4 归一化 -19.50dB RMS，峰值上限 0.5
"""
import numpy as np, soundfile as sf, sys, json

SRC, DST = sys.argv[1], sys.argv[2]
DB_TILT = 4.5
LO, HI = 900.0, 1800.0

# (起点秒, 终点秒, dB) —— 与 compose 里的段边界一致
SEC_FIX = [
    (0.0, 8.372, 0.0),        # intro：下面单独处理
    (8.372, 30.698, 0.0),     # A
    (30.698, 53.023, 0.0),    # B
    (53.023, 75.349, -1.2),   # A2：原曲这里最薄
    (75.349, 97.674, 0.4),    # C
    (97.674, 120.0, 0.4),     # C2
    (120.0, 142.326, 0.8),    # D
    (142.326, 164.651, 1.2),  # D2：全曲顶点
    (164.651, 168.14, 1.0),   # END
    (168.14, 1e9, 0.6),       # coda
]

x, sr = sf.read(SRC, dtype='float64', always_2d=True)
n = len(x)
f = np.fft.rfftfreq(n, 1.0 / sr)
ramp = np.clip((f - LO) / (HI - LO), 0.0, 1.0)
g = 10.0 ** (DB_TILT * ramp / 20.0)
for ch in range(x.shape[1]):
    x[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch]) * g, n)

t = np.arange(n) / sr
env = np.ones(n)
R = int(0.18 * sr)


def apply_span(a, b, db):
    gain = 10 ** (db / 20.0)
    i0, i1 = int(a * sr), min(int(b * sr), n)
    env[i0:i1] *= gain
    k = min(R, i0)
    if k > 0:
        w = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
        env[i0 - k:i0] *= 1.0 + (gain - 1.0) * w
    k = min(R, n - i1)
    if k > 0:
        w = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / k)
        env[i1:i1 + k] *= 1.0 + (gain - 1.0) * w


for a, b, db in SEC_FIX:
    if abs(db) > 1e-9:
        apply_span(a, b, db)

# 引子/尾声整体抬起（这两段是氛围段，母带 sat 之后太小声）
for a, b, db in ((0.0, 8.372, 4.0), (168.14, n / sr, 4.0)):
    gain = 10 ** (db / 20.0)
    i0, i1 = int(a * sr), min(int(b * sr), n)
    env[i0:i1] *= gain
    k = min(int(0.35 * sr), max(0, n - i1))
    if k > 0:
        w = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / k)
        env[i1:i1 + k] *= 1.0 + (gain - 1.0) * w

x *= env[:, None]
rms = np.sqrt(np.mean(x[:, 0] ** 2 + x[:, 1] ** 2))
x *= 10 ** (-19.5 / 20) / rms
pk = float(np.abs(x).max())
if pk > 0.5:
    x *= 0.5 / pk
sf.write(DST, x, sr, subtype='PCM_16')
print(json.dumps({'dst': DST, 'tilt_db': DB_TILT, 'peak': round(float(np.abs(x).max()), 4),
                  'rms_db': round(20 * np.log10(np.sqrt(np.mean(x[:, 0] ** 2 + x[:, 1] ** 2))), 3),
                  'corr': round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 4),
                  'seam_L': round(float(abs(x[0, 0] - x[-1, 0])), 6),
                  'seam_R': round(float(abs(x[0, 1] - x[-1, 1])), 6),
                  'bytes': int(x.size * 2 + 44)}, ensure_ascii=False))
