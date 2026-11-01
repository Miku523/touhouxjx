# -*- coding: utf-8 -*-
import os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
def rd(p):
    with wave.open(p) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
        return y, w.getframerate(), w.getnchannels()
A, B = 51.429, 54.545
out = {}
for d in ('stems_v9', 'stems_v10'):
    p = os.path.join(HERE, d)
    for f in sorted(os.listdir(p)):
        if not f.endswith('.wav'):
            continue
        y, sr, nc = rd(os.path.join(p, f))
        seg = y[int(A*sr):int(B*sr)]
        out.setdefault(f[:-4], {})[d] = 20*np.log10(max(np.sqrt(np.mean(seg**2)), 1e-9))
print('%-12s %8s %8s %8s' % ('stem', 'v9', 'v10', 'delta'))
for k, v in out.items():
    if v['stems_v9'] > -80 or v['stems_v10'] > -80:
        print('%-12s %8.1f %8.1f %+8.1f' % (k, v['stems_v9'], v['stems_v10'], v['stems_v10'] - v['stems_v9']))
