# -*- coding: utf-8 -*-
"""把成品的响度包络和 refA 原曲录音对比，看「照原曲」照得像不像。"""
import sys, numpy as np, soundfile as sf

WAV = sys.argv[1] if len(sys.argv) > 1 else 'tools/build/boss5_mura_v14.wav'
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\boss5\refA.mp3'

def load(p):
    x, sr = sf.read(p, always_2d=False)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x.astype(np.float32), sr

x, sr = load(WAV)
r, rsr = load(REF)

def env(y, s, target, win_sec=4.0):
    n = int(target * s)
    y = y[:n]
    win = int(win_sec * s)
    k = len(y) // win
    return np.array([float(np.sqrt(np.mean(y[i*win:(i+1)*win] ** 2)) + 1e-9) for i in range(k)])

ew, er = env(x, sr, 150.0), env(r, rsr, 150.0)
m = min(len(ew), len(er))
ew, er = ew[:m], er[:m]
lw, lr = 20*np.log10(ew/ew.mean()), 20*np.log10(er/er.mean())
print('窗口 4s x %d；响度包络相关 %.3f' % (m, float(np.corrcoef(lw, lr)[0, 1])))
print('%3s %8s %8s %7s' % ('t', 'ours', 'refA', 'diff'))
for i in range(m):
    d = lw[i]-lr[i]
    print('%3d %8.1f %8.1f %7.1f%s' % (i*4, lw[i], lr[i], d, '  <-' if abs(d) > 4 else ''))
