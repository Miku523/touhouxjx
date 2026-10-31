# -*- coding: utf-8 -*-
import json, os, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = {
 "intro": [0.0, 6.0],
 "organ": [6.0, 19.3],
 "vibes": [19.3, 32.25],
 "theme": [32.25, 45.0],
 "theme2": [45.0, 59.8],
 "bridge": [59.8, 69.8],
 "var1": [69.8, 83.55],
 "var2": [83.55, 97.2],
 "coda": [97.2, 103.748],
}
p = os.path.join(HERE, 'secs.json')
if os.path.exists(p) and not os.path.exists(os.path.join(HERE, 'secs_v1.json')):
    shutil.copy(p, os.path.join(HERE, 'secs_v1.json'))
json.dump(SEC, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('secs', SEC)

# 通用分轨分析
an = '''# -*- coding: utf-8 -*-
import os, sys, glob, json
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
STEMS = os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else 'stems_v2')
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
order = ['intro','organ','vibes','theme','theme2','bridge','var1','var2','coda']
def db(x): return 20*np.log10(max(1e-9, x))
rows = []
for f in sorted(glob.glob(os.path.join(STEMS, '*.wav'))):
    y, sr = sf.read(f, dtype='float64')
    if y.ndim > 1: y = y.mean(axis=1)
    r = [db(np.sqrt(np.mean(y**2)))]
    for k in order:
        a, b = SEC[k]
        seg = y[int(a*sr):int(b*sr)]
        r.append(db(np.sqrt(np.mean(seg**2))) if len(seg) else -120)
    rows.append((os.path.basename(f)[:-4], r))
print('%-16s %7s' % ('stem','whole') + ''.join('%9s' % k for k in order))
for n, r in rows:
    print('%-16s %7.2f' % (n, r[0]) + ''.join('%9.2f' % x for x in r[1:]))
'''
open(os.path.join(HERE, '_an2.py'), 'w', encoding='utf-8').write(an)
print('wrote _an2.py')
