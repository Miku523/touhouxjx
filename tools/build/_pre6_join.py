# -*- coding: utf-8 -*-
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf
BASE = os.path.dirname(os.path.abspath(__file__))
y, sr = sf.read(os.path.join(BASE, sys.argv[1]))
if y.ndim > 1: y = y.mean(axis=1)
t0, t1 = float(sys.argv[2]), float(sys.argv[3])
step = 0.25
print('逐 0.25s RMS %.2f-%.2fs' % (t0, t1))
t = t0
row = []
while t < t1:
    seg = y[int(t*sr):int((t+step)*sr)]
    row.append('%.2f:%.3f' % (t, np.sqrt((seg**2).mean())))
    t += step
for i in range(0, len(row), 8):
    print('  ' + ' '.join(row[i:i+8]))
