# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
def score(off):
    on480 = sum(1 for n in ns if (n['tickOn']-off) % 480 == 0)
    on240 = sum(1 for n in ns if (n['tickOn']-off) % 240 == 0)
    return on480, on240
for off in (0,80,120,200,320,440,560,680):
    print('offset', off, 'on480/on240', score(off))
print()
for label, pitches in (('bass ch1', None),):
    pass
for c,label in ((1,'bass'),(9,'drums'),(2,'piano')):
    sub=[n for n in ns if n['ch']==c]
    for off in (80,200,320,440):
        c480=sum(1 for n in sub if (n['tickOn']-off)%480==0)
        print('ch%d %s off%d on480 %d / %d' % (c,label,off,c480,len(sub)))
print()
print('drums per instrument mod1920 hist (raw):')
for pitch in (36,37,38,40,41,42,46,49,51):
    sub=[n for n in ns if n['ch']==9 and n['pitch']==pitch]
    if not sub: continue
    h=Counter(n['tickOn']%1920 for n in sub).most_common(5)
    print(' pitch',pitch,M.pname(pitch),'n',len(sub),h)
