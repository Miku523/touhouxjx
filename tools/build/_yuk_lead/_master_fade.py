# -*- coding: utf-8 -*-
"""立体声母版收尾：循环点 80ms 余弦淡入淡出 + 总量 RMS 归一到 -19.50 dBFS。"""
import os, sys, json, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'build', '_kag_kit', 'kaguya_stereo_raw.wav')
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'build', '_kag_kit', 'kaguya_stage6_stereo.wav')
F = 0.080
x, sr = sf.read(SRC, dtype='float64')
n = len(x)
k = int(F * sr)
w = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
x[:k] *= w[:, None]
x[n-k:] *= w[::-1, None]
rms = np.sqrt(np.mean(x[:, 0] ** 2 + x[:, 1] ** 2))
target = 10 ** (-19.5 / 20)
x *= target / rms
pk = float(np.abs(x).max())
if pk > 0.5:
    x *= 0.5 / pk
    rms = np.sqrt(np.mean(x[:, 0] ** 2 + x[:, 1] ** 2))
sf.write(DST, x, sr, subtype='PCM_16')
m = x.mean(axis=1)
print(json.dumps({
    'dst': DST, 'sr': sr, 'frames': n, 'duration': n / sr,
    'fade_ms': F * 1000,
    'peak': round(float(np.abs(x).max()), 6),
    'rms_total_db': round(20 * float(np.log10(np.sqrt(np.mean(x[:,0]**2 + x[:,1]**2)))), 4),
    'rms_ch_db': round(20 * float(np.log10(np.sqrt(np.mean(x**2)))), 4),
    'seam_L': round(float(abs(x[0,0] - x[-1,0])), 6),
    'seam_R': round(float(abs(x[0,1] - x[-1,1])), 6),
    'seam_mono': round(float(abs(m[0] - m[-1])), 6),
    'corr': round(float(np.corrcoef(x[:,0], x[:,1])[0,1]), 4),
    'bytes': int(x.size * 2 + 44),
}, ensure_ascii=False))