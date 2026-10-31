# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
SHIFT=440
def mbar(n): return int((n['tickOn']-SHIFT)//1920)+1
def mbeat(n): return ((n['tickOn']-SHIFT)%1920)/480.0+1.0
# offset stability check per 10-bar chunk
print('offset stability (best o among 80/200/320/440 by on-8th count):')
for c0 in range(0, 82, 10):
    sub=[n for n in ns if c0<=n['bar']<c0+10]
    if not sub: continue
    best=max((sum(1 for n in sub if (n['tickOn']-o)%240==0), o) for o in (80,200,320,440))
    print('  midi bars %2d-%2d n=%4d  best o=%d  on8th=%d (%.0f%%)' % (c0,c0+9,len(sub),best[1],best[0],100.0*best[0]/len(sub)))
print()
# per-bar structure on shifted grid
tot=max(mbar(n) for n in ns)
print('total music bars =', tot)
print('bar: ch1 ch2 ch3 ch4 ch5 ch6 ch7 ch8 ch9 ch10 ch11 ch12 ch13 ch14  (onset counts)')
rows=[]
for b in range(1, tot+1):
    c=Counter()
    for n in ns:
        if mbar(n)==b: c[n['ch']]+=1
    rows.append((b,c))
for b,c in rows:
    print('%3d: %s' % (b, ' '.join('%3d'%c.get(ch,0) for ch in (1,2,3,4,5,6,7,8,9,10,11,12,13,14))))
