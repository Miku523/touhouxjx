# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
print('per-channel best metric offset (count of onsets at o mod 480, o in note-grid):')
for c in range(16):
    sub=[n for n in ns if n['ch']==c]
    if len(sub)<8: 
        print(' ch%2d n=%4d  (too few)' % (c,len(sub))); continue
    best=None
    for o in (80,200,320,440):
        k=sum(1 for n in sub if (n['tickOn']-o)%480==0)
        k8=sum(1 for n in sub if (n['tickOn']-o)%240==0)
        k16=sum(1 for n in sub if (n['tickOn']-o)%120==0)
        rec=(k8,k,k16)
        if best is None or rec>best[0]: best=(rec,o)
    (k8,k,k16),o=best
    print(' ch%2d n=%4d  best o=%3d  on8th=%4d onbeat=%4d on16th=%4d  (%.0f%% on 8th grid)' % (c,len(sub),o,k8,k,k16,100.0*k8/len(sub)))
print()
print('candidate offsets per channel (on480 count) for ch3,ch1,ch9,ch13,ch2:')
for c in (3,1,9,13,2,4,11):
    sub=[n for n in ns if n['ch']==c]
    line=[]
    for o in (80,200,320,440):
        line.append('o%d:%d/%d/%.0f%%'%(o,sum(1 for n in sub if (n['tickOn']-o)%480==0), sum(1 for n in sub if (n['tickOn']-o)%240==0), 100.0*sum(1 for n in sub if (n['tickOn']-o)%240==0)/len(sub)))
    print(' ch%2d  %s' % (c, '  '.join(line)))
