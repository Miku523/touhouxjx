# -*- coding: utf-8 -*-
import os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
def rd(p):
    with wave.open(p) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
        return y, w.getframerate(), w.getnchannels()
SEC = [('A1',6.234,26.494),('B',26.494,51.429),('break',51.429,54.545),('C2',91.948,104.416),('C3',104.416,116.883),('D2',129.351,141.818)]
files = {}
for d in ('stems_v9', 'stems_v10'):
    p = os.path.join(HERE, d)
    files[d] = sorted(f for f in os.listdir(p) if f.endswith('.wav'))
print('v9 files', len(files['stems_v9']), 'v10', len(files['stems_v10']))
print('missing in v10:', sorted(set(files['stems_v9']) - set(files['stems_v10'])))
print()
for sec, A, B in SEC:
    print('--', sec)
    for f in files['stems_v9']:
        if f not in files['stems_v10']:
            continue
        row = [f[:-4]]
        for d in ('stems_v9', 'stems_v10'):
            y, sr, nc = rd(os.path.join(HERE, d, f))
            seg = y[int(A*sr):int(B*sr)]
            row.append(20*np.log10(max(np.sqrt(np.mean(seg**2)), 1e-9)))
        if row[1] > -45 or row[2] > -45:
            print('   %-12s %7.1f %7.1f  %+6.1f' % (row[0], row[1], row[2], row[2]-row[1]))
