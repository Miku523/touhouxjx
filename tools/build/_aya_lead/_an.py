# -*- coding: utf-8 -*-
import json, os, sys, glob, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sec = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
def db(v): return 20*np.log10(max(v,1e-12))
def load(p):
    x, sr = sf.read(p, dtype='float64')
    if x.ndim > 1: x = x.mean(axis=1)
    return x, sr
master, sr = load(sys.argv[1])
print('whole RMS %.2f peak %.3f' % (db(np.sqrt(np.mean(master*master))), np.abs(master).max()))
for nm, a, b in sec['secs']:
    s, e = int(a*sr), min(int(b*sr), len(master))
    seg = master[s:e]
    print('%-6s %6.2f-%6.2f  RMS %6.2f' % (nm, a, b, db(np.sqrt(np.mean(seg*seg)))))
if len(sys.argv) > 2:
    stems = sorted(glob.glob(os.path.join(sys.argv[2], '*.wav')))
    print('--- stems:', len(stems))
    hdr = 'track'.ljust(22) + ''.join('%8s' % n for n, _, _ in sec['secs'])
    print(hdr)
    data = {}
    for p in stems:
        x, sr2 = load(p)
        arr = []
        for nm, a, b in sec['secs']:
            s, e = int(a*sr2), min(int(b*sr2), len(x))
            arr.append(db(np.sqrt(np.mean(x[s:e]**2))) if e > s else -99)
        data[os.path.basename(p)] = arr
        print(os.path.basename(p)[:22].ljust(22) + ''.join('%8.1f' % v for v in arr))
