# -*- coding: utf-8 -*-
import json, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
d=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
BAR_SRC=60.0/d['bpm']*4
print('源小节 %.4fs  bpm %s'%(BAR_SRC, d['bpm']))
for ch in ('6','10','2','9','1','3','4','5','8','13'):
    ns=d['channels'][ch]['notes']
    ts={}
    for t,m,du,v in ns: ts.setdefault(round(t,3),[]).append(m)
    g=Counter(len(v) for v in ts.values())
    print('ch%-3s prog=%-8s 音数%-5d 音域%d-%d 中位%d 同时分布%s' % (ch, d['channels'][ch]['progs'], len(ns),
          min(n[1] for n in ns), max(n[1] for n in ns), sorted(n[1] for n in ns)[len(ns)//2], dict(g)))
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print('\nch6 前 48 音（秒 / 小节.拍 / 音名 / 时值）：')
for i,(t,m,du,v) in enumerate(d['channels']['6']['notes'][:48]):
    bb=t/BAR_SRC
    print('  %6.3f  b%02d.%02d %-4s %.3f'%(t,int(bb)+1,(bb%1)*4,nn[m%12]+str(m//12-1),du), end='')
    if i%3==2: print()
print()
