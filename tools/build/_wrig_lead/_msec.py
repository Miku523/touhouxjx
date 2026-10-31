# -*- coding: utf-8 -*-
import json, os, sys, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
wav = sys.argv[1]
x, sr = sf.read(wav, dtype='float64')
if x.ndim > 1: x = x.mean(axis=1)
def db(v): return 20*np.log10(max(v,1e-12))
print('whole RMS %.2f dBFS peak %.3f' % (db(np.sqrt(np.mean(x*x))), np.abs(x).max()))
prev = 0.0
for nm, a, b in sec['secs']:
    s, e = int(a*sr), min(int(b*sr), len(x))
    seg = x[s:e]
    print('%-6s %6.2f-%6.2f  RMS %6.2f  peak %.3f' % (nm, a, b, db(np.sqrt(np.mean(seg*seg))), np.abs(seg).max()))
