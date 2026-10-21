# -*- coding: utf-8 -*-
"""分段分频带 RMS：看前奏到底缺哪一层"""
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = sys.argv[1] if len(sys.argv) > 1 else 'ex_sept_v2b.wav'
y, sr = sf.read(p, dtype='float32', always_2d=True); x = y.mean(1)
def bandrms(a, b, lo, hi):
    seg = x[int(a*sr):int(b*sr)]
    S = np.fft.rfft(seg * np.hanning(len(seg))); f = np.fft.rfftfreq(len(seg), 1.0/sr)
    S[(f < lo) | (f >= hi)] = 0
    z = np.fft.irfft(S, n=len(seg))
    return float(np.sqrt((z**2).mean()))
for tag, a, b in [('前奏 0-11s', 0, 11), ('主体 20-40s', 20, 40), ('高潮 100-118s', 100, 118)]:
    vals = [bandrms(a, b, lo, hi) for lo, hi in [(20,120),(120,500),(500,2000),(2000,6000),(6000,16000)]]
    tot = float(np.sqrt((x[int(a*sr):int(b*sr)]**2).mean()))
    print('%-14s 总 %.3f  各带 %s' % (tag, tot, ' '.join('%.3f' % v for v in vals)))
