# -*- coding: utf-8 -*-
"""快速估计参考曲 BPM（onset 包络自相关），并算与 MIDI/自制曲的色度相似度。"""
import sys

import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SRC = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref1.mp3'
SRC5 = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref5.mp3'
SRC3 = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref3.mp3'


def load(path, sr=11025):
    x, r = sf.read(path, always_2d=True)
    x = x.mean(axis=1)
    if r != sr:
        n = int(len(x) * sr / r)
        idx = np.linspace(0, len(x) - 1, n)
        x = np.interp(idx, np.arange(len(x)), x)
    return x.astype(np.float32), sr


def onset_env(x, sr, hop=128):
    n = 1 + len(x) // hop
    e = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(n)])
    d = np.diff(e, prepend=e[0])
    d = np.maximum(d, 0)
    # 半波整流后轻度平滑
    k = np.ones(3) / 3
    return np.convolve(d, k, mode='same'), sr / hop


def bpm_est(x, sr, lo=100, hi=200):
    env, fps = onset_env(x, sr)
    env = env - env.mean()
    ac = np.correlate(env, env, 'full')[len(env) - 1:]
    ac /= ac[0] + 1e-9
    best = []
    for bpm in np.arange(lo, hi, 0.5):
        lag = 60.0 / bpm * fps
        i0 = int(np.floor(lag))
        if i0 + 1 >= len(ac):
            continue
        v = ac[i0] + (ac[i0 + 1] - ac[i0]) * (lag - i0)
        best.append((v, bpm))
    best.sort(reverse=True)
    return best[:5], fps


for path, name in [(SRC, 'ref1'), (SRC5, 'ref5'), (SRC3, 'ref3')]:
    x, sr = load(path)
    top, fps = bpm_est(x, sr)
    print('%s  时长 %.1fs  fps %.1f' % (name, len(x) / sr, fps))
    for v, b in top:
        print('    %.3f @ %.1f BPM  (倍速 %.1f / %.1f)' % (v, b, b * 2, b / 2))
