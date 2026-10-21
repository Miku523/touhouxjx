# -*- coding: utf-8 -*-
"""快速解剖：mel 140s / bp 194s（不做测速）"""
import os, sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
for tag, name in [('mel','sept_mel.mp3'), ('bp','sept_bp.mp3')]:
    y, sr = sf.read(os.path.join(D, name), dtype='float32', always_2d=True)
    x = y.mean(1)
    n = len(x); dur = n / sr
    sp = np.abs(np.fft.rfft(x * np.hanning(n))); f = np.fft.rfftfreq(n, 1.0/sr)
    edges = [(20,120),(120,500),(500,2000),(2000,6000),(6000,16000)]
    e = np.array([float((sp[(f>=a)&(f<b)]**2).sum()) for a,b in edges]); e = e/e.sum()*100
    cen = float((sp[(f>=20)&(f<16000)]*f[(f>=20)&(f<16000)]).sum()/(sp[(f>=20)&(f<16000)].sum()+1e-9))
    print('== %s %.1fs RMS %.4f 峰 %.3f 质心 %.0fHz 频段 %s' % (tag, dur, float(np.sqrt((x**2).mean())), float(np.abs(x).max()), cen, np.round(e,1)))
    line = []
    for k in range(0, int(dur), 8):
        seg = x[int(k*sr):int((k+8)*sr)]
        line.append('%.3f' % float(np.sqrt((seg**2).mean())))
    print('   每 8s RMS:', ' '.join(line))
