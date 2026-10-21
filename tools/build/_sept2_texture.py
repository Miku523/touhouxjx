# -*- coding: utf-8 -*-
"""bp（蓝图）逐 2s 织体：五段频带占比 + 质心 + RMS + 低频/中频能量，看它是什么编制"""
import os, sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
y, sr = sf.read(os.path.join(D, 'sept_bp.mp3'), dtype='float32', always_2d=True)
x = y.mean(1)
N = 8192; hop = sr  # 1s
edges = [(20,120),(120,500),(500,2000),(2000,6000),(6000,16000)]
win = np.hanning(N)
print('  t     RMS   低  中低  中  中高  高   质心')
for i in range(0, int(len(x)) - N, int(hop)):
    seg = x[i:i+N]
    sp = np.abs(np.fft.rfft(seg*win)); f = np.fft.rfftfreq(N, 1.0/sr)
    e = np.array([float((sp[(f>=a)&(f<b)]**2).sum()) for a,b in edges])
    pct = e/(e.sum()+1e-12)*100
    cen = float((sp*f).sum()/(sp.sum()+1e-9))
    rms = float(np.sqrt((seg**2).mean()))
    t = i/sr
    if int(t) % 2 == 0:
        print('%5.0f  %.3f  %4.1f %4.1f %4.1f %4.1f %4.1f  %5.0f' % (t, rms, pct[0], pct[1], pct[2], pct[3], pct[4], cen))
