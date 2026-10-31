# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
BASE2 = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')
MID = os.path.join(BASE2, '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
SHIFT=2360
def gbar(t): return int((t-SHIFT)//1920)+1
def gbeat(t): return ((t-SHIFT)%1920)/480.0+1.0
byb={}
for n in ns: byb.setdefault(gbar(n['tickOn']),[]).append(n)
for b in list(range(1,26)):
    sub=byb.get(b,[])
    def names(ch): return ' '.join('%s/%d'%(M.pname(n['pitch']), round(gbeat(n['tickOn']),2)) for n in sorted([x for x in sub if x['ch']==ch], key=lambda x:x['tickOn']))
    print('bar%2d bass:%-42s mel:%-46s pnoLow:%s' % (b, names(1), names(3), names(13)))
