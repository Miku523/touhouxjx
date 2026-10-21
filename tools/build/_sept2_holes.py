# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = sys.argv[1] if len(sys.argv) > 1 else 'ex_sept_v2f.wav'
y, sr = sf.read(p, dtype='float32', always_2d=True); x = y.mean(1)
def seg(a, b): return float(np.sqrt((x[int(a*sr):int(b*sr)]**2).mean()))
print('--- 进场 8-14s（每 0.5s）')
t = 8.0
out = []
while t < 14.0:
    out.append('%.2f %.3f' % (t, seg(t, t+0.5))); t += 0.5
print(' | '.join(out))
print('--- 22-38s（每 1s）')
t = 22.0
out = []
while t < 38.0:
    out.append('%.0f %.3f' % (t, seg(t, t+1))); t += 1
print(' | '.join(out))
