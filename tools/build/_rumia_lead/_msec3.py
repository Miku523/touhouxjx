# -*- coding: utf-8 -*-
import os, sys, json
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
order = ['intro','organ','vibes','theme','theme2','bridge','var1','var2','coda']
def db(x): return 20*np.log10(max(1e-9,x))
for path in sys.argv[1:]:
    y, sr = sf.read(path, dtype='float64')
    if y.ndim > 1:
        tot = np.sqrt(np.mean(y**2)); mono = y.mean(axis=1)
    else:
        tot = np.sqrt(np.mean(y**2)); mono = y
    print(os.path.basename(path), 'sr', sr, 'dur %.3f' % (len(mono)/sr), 'whole %.2f peak %.4f' % (db(tot), np.max(np.abs(y))))
    if y.ndim > 1:
        print('  L/R corr %.4f' % float(np.corrcoef(y[:,0], y[:,1])[0,1]))
    for k in order:
        a, b = SEC[k]
        seg = y[int(a*sr):int(b*sr)]
        print('  %-7s %.2f' % (k, db(np.sqrt(np.mean(seg**2)))))
