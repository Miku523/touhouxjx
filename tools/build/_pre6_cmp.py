# -*- coding: utf-8 -*-
"""refA 与成品：五段频带、质心、RMS、每 8s 响度（并对齐比较包络）。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf

BASE = os.path.dirname(os.path.abspath(__file__))
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
BANDS = [(20,80),(80,120),(120,500),(500,5000),(5000,20000)]

def prof(x, sr, tag):
    x = x.astype(np.float64)
    if x.ndim > 1: x = x.mean(axis=1)
    X = np.abs(np.fft.rfft(x))**2
    F = np.fft.rfftfreq(len(x), 1.0/sr)
    tot = X.sum()
    pct = []
    for lo, hi in BANDS:
        m = (F >= lo) & (F < hi)
        pct.append(100.0*X[m].sum()/tot)
    cen = (F*X).sum()/X.sum()
    rms = np.sqrt((x**2).mean())
    print('%-10s RMS %.4f 峰 %.3f 频段 [%s] 质心 %.0fHz' % (
        tag, rms, np.abs(x).max(), ','.join('%.1f' % p for p in pct), cen))
    return np.array(pct), rms

x, sr = sf.read(REF, always_2d=False)
prof(x, sr, 'refA')

for name in sys.argv[1:]:
    y, sr2 = sf.read(os.path.join(BASE, name), always_2d=False)
    prof(y, sr2, name)

# 逐小节包络对齐（refA 68 小节 vs 成品 52.03 小节，shift 3）
x, sr = sf.read(REF, always_2d=False)
if x.ndim > 1: x = x.mean(axis=1)
BAR = 4*60/162.0
def env(x, sr, nbar):
    out = []
    for b in range(nbar):
        seg = x[int(b*BAR*sr):int((b+1)*BAR*sr)]
        out.append(np.sqrt((seg**2).mean()) if len(seg) else 0.0)
    return np.array(out)
er = env(x, sr, 66)
print('refA 逐小节 RMS（前 24）:', ' '.join('%.3f' % v for v in er[:24]))
