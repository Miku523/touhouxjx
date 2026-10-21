# -*- coding: utf-8 -*-
"""成品 vs refA：逐小节色度相关（搜最佳 shift），确认织体/和声跟原曲对齐。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf

BASE = os.path.dirname(os.path.abspath(__file__))
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
BAR = 4*60/162.0
NFFT = 8192

def chroma(x, sr, nb, shift_bars=0.0):
    out = []
    for b in range(nb):
        t0 = (b + shift_bars) * BAR
        i0 = int(t0*sr)
        seg = x[i0:i0+int(BAR*sr)]
        if len(seg) < 1024:
            out.append(np.zeros(12)); continue
        X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
        F = np.fft.rfftfreq(len(seg), 1.0/sr)
        v = np.zeros(12)
        m = (F > 120) & (F < 2500)
        midi = 69 + 12*np.log2(np.maximum(F[m], 1e-9)/440.0)
        pc = np.mod(np.round(midi).astype(int), 12)
        np.add.at(v, pc, X[m])
        v /= (np.linalg.norm(v) + 1e-9)
        out.append(v)
    return np.array(out)

x, sr = sf.read(REF, always_2d=False)
if x.ndim > 1: x = x.mean(axis=1)
y, sr2 = sf.read(os.path.join(BASE, sys.argv[1]), always_2d=False)
if y.ndim > 1: y = y.mean(axis=1)
# 成品第一遍
y = y[:int(77.082*sr2)]
cy = chroma(y, sr2, 52)
best = None
for sh in range(-4, 10):
    cr = chroma(x, sr, 52, shift_bars=sh)
    cors = [float(np.dot(a, b)) for a, b in zip(cy, cr)]
    med = float(np.median(cors))
    if best is None or med > best[1]:
        best = (sh, med, float(np.mean(cors)))
print('最佳 shift %+d 小节：逐小节色度相关 中位 %.3f 平均 %.3f' % best)
sh = best[0]
cr = chroma(x, sr, 52, shift_bars=sh)
cors = [float(np.dot(a, b)) for a, b in zip(cy, cr)]
print('逐 8 小节:', ' '.join('%.2f' % v for v in [np.mean(cors[i:i+8]) for i in range(0, 48, 8)]))
print('低相关小节:', ' '.join('%d:%.2f' % (i, v) for i, v in enumerate(cors) if v < 0.5))
