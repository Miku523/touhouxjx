# -*- coding: utf-8 -*-
import json, os, sys, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))['secs']
x, sr = sf.read(sys.argv[1], dtype='float64')
if x.ndim == 1: x = np.stack([x, x], axis=1)
tot = np.sqrt(np.mean(x[:,0]**2 + x[:,1]**2))
print('whole total-RMS %.2f  per-ch %.2f  peak %.4f  corr %.3f' % (20*np.log10(tot), 20*np.log10(np.sqrt(np.mean(x**2))), np.abs(x).max(), np.corrcoef(x[:,0], x[:,1])[0,1]))
for nm, a, b in sec:
    s, e = int(a*sr), min(int(b*sr), len(x))
    seg = x[s:e]
    r = np.sqrt(np.mean(seg[:,0]**2 + seg[:,1]**2))
    rc = np.sqrt(np.mean(seg**2))
    c = np.fft.rfft(seg.mean(axis=1) * np.hanning(len(seg)))
    f = np.fft.rfftfreq(len(seg), 1/sr)
    cen = float((np.abs(c)*f).sum() / max(np.abs(c).sum(), 1e-12))
    print('%-8s %6.2f-%6.2f  total %6.2f  per-ch %6.2f  mono-equiv %6.2f  centroid %5.0f' % (nm, a, b, 20*np.log10(r), 20*np.log10(rc), 20*np.log10(rc)+3.01, cen))
