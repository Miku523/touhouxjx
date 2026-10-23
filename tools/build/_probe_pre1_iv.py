# -*- coding: utf-8 -*-
import sys, os, json, re
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
src = open(os.path.join(ROOT,'src','engine','songs','honou_pre1.js'),encoding='utf-8').read()
m = re.search(r'drums:\s*(\[\[.*?\]\])', src, re.S)
dr = json.loads(m.group(1))
for k in range(5):
    ts = [d[0] for d in dr if d[1]==k]
    iv = sorted(round(b-a,3) for a,b in zip(ts,ts[1:]))
    c = Counter(iv)
    print('kind %d  n=%d  间隔 top: %s' % (k, len(ts), c.most_common(6)))
    print('   间隔分布:', sorted(c.items())[:8])
