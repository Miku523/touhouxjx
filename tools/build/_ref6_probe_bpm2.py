# -*- coding: utf-8 -*-
"""_ref6_probe_bpm2.py —— 精细 BPM 扫描（16 分网格对比度 + 节拍相位）"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'


def contrast(env, times, bpm, off, t0, t1, div=4):
    per = 60.0 / bpm
    step = per / div
    t = off + np.ceil((t0 - off) / step) * step
    vals = []
    while t < t1 - 1e-9:
        m = (times >= t - 0.03) & (times <= t + 0.03)
        vals.append(float(env[m].max()) if m.any() else 0.0)
        t += step
    v = np.array(vals)
    if len(v) < 16:
        return 0.0
    return float(v.mean() / (v.mean() + v.std() + 1e-9) * (v.max() / (np.median(v) + 1e-9)) ** 0.5)


for tag, lo, hi in (('ref1', 148, 156), ('ref3', 150, 162), ('ref5', 148, 156)):
    y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
    f = L.frame_features(y, sr, n_fft=2048, hop=512, verbose=False)
    env = f['flux']
    off, ph = L.refine_phase(f, 152.0)
    print('\n%s  phase=%.3f (score %.3f)' % (tag, off, ph))
    best = []
    for bpm in np.arange(lo, hi + 1e-9, 0.1):
        o = off
        # 相位随 bpm 微调：用 4 分音符锚点重新对齐（保持鼓点位置）
        c = contrast(env, f['times'], bpm, o, 20.0, min(len(y) / sr, 120.0), div=4)
        c2 = contrast(env, f['times'], bpm, o, 20.0, min(len(y) / sr, 120.0), div=2)
        best.append((c + 0.5 * c2, bpm, c, c2))
    best.sort(reverse=True)
    for s, bpm, c, c2 in best[:5]:
        print('   bpm=%.1f  16th=%.3f 8th=%.3f' % (bpm, c, c2))
