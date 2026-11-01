# -*- coding: utf-8 -*-
import os, sys, glob
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')

def band_abs(x, sr, lo, hi):
    X = np.fft.rfft(x * np.hanning(len(x)))
    f = np.fft.rfftfreq(len(x), 1.0 / sr)
    m = (f >= lo) & (f < hi)
    return 10*np.log10(max(float(np.sum(np.abs(X[m])**2)), 1e-20))

for n in ('pre1','pre3','pre4','pre2','pre6'):
    d = os.path.join(LEAD, 'stems_' + n + '_v70')
    if not os.path.isdir(d):
        print(n, 'no stems'); continue
    rows = []
    for f in sorted(glob.glob(os.path.join(d, '*.wav'))):
        x, sr = sf.read(f, always_2d=True)
        x = x.mean(axis=1)
        rows.append((band_abs(x, sr, 63, 125), os.path.basename(f)))
    rows.sort(reverse=True)
    tot = 10*np.log10(sum(10**(v/10) for v, _ in rows))
    print('==', n, 'total 63-125 %.1f dB' % tot)
    for v, nm in rows[:5]:
        print('   %-16s %6.1f  (%.1f%%)' % (nm, v, 100*10**((v-tot)/10)))
