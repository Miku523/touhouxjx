# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
byb={}
for n in ns: byb.setdefault(n['bar'],[]).append(n)
print('=== last 4 bars (full) ===')
for b in (78,79,80,81):
    print(' -- bar', b)
    for n in sorted(byb.get(b,[]), key=lambda x:(x['tickOn'],x['ch'])):
        pos=n['tickOn']%1920
        print('   pos%4d(%.2f) ch%2d %-4s v%3d d%4d' % (pos,pos/480.0,n['ch'],M.pname(n['pitch']),n['vel'],n['tickOff']-n['tickOn']))
print()
print('=== bass ch1 lowest note per bar (0-based bars 8-40) ===')
for b in range(8,41):
    sel=[n for n in byb.get(b,[]) if n['ch']==1]
    if not sel: 
        print('  bar%2d  -' % b); continue
    first=min(sel, key=lambda n:n['tickOn'])
    low=min(sel, key=lambda n:n['pitch'])
    print('  bar%2d first %-4s(%d) low %-4s  n=%d' % (b, M.pname(first['pitch']), first['pitch'], M.pname(low['pitch']), len(sel)))
