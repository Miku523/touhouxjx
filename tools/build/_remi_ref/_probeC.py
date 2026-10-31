# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
last=max(n['tickOff'] for n in ns)
print('lastTick note-off =', last, ' bars =', last/1920.0)
byb={}
for n in ns: byb.setdefault(n['bar'],[]).append(n)
for b in (80,81):
    print(' -- bar', b)
    for n in sorted(byb.get(b,[]), key=lambda x:(x['tickOn'],x['ch'])): 
        print('   pos%4d(%.2f) ch%2d %-4s v%3d d%4d off%6d' % (n['tickOn']%1920,n['tickOn']%1920/480.0,n['ch'],M.pname(n['pitch']),n['vel'],n['tickOff']-n['tickOn'],n['tickOff']))
