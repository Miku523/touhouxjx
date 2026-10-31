# -*- coding: utf-8 -*-
import sys, os
from collections import defaultdict, Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
SHIFT=2360
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
def gbar(t): return int((t - SHIFT) // 1920) + 1
def gpos(t): return ((t - SHIFT) % 1920) // 120   # 16th index 0..15
byb = defaultdict(list)
for n in ns: byb[gbar(n['tickOn'])].append(n)
def line(b, ch):
    sub = sorted([n for n in byb.get(b,[]) if n['ch']==ch], key=lambda x:(x['tickOn'], x['pitch']))
    return ' '.join('%s@%.2f' % (M.pname(n['pitch']), ((n['tickOn']-SHIFT)%1920)/480.0+1.0) for n in sub)
for b in range(49, 65):
    print('b%2d L:%s' % (b, line(b,3)[:130]))
print('--- ch6/ch7 bars 57-64')
for b in range(57, 65):
    print('b%2d 6:%s | 7:%s' % (b, line(b,6)[:50], line(b,7)[:50]))
print('--- DRUMS 16th grids (row per bar, instr: positions)')
DR = {36:'K',38:'S',37:'s',42:'h',46:'H',49:'c',51:'R',41:'f',40:'E',48:'C'}
for b in [2,5,9,12,16,20,24,28,32,36,40,44,48,50,52,56,60,64,68,72,76,79,80,81]:
    d = defaultdict(list)
    for n in byb.get(b,[]):
        if n['isDrum']: d[n['pitch']].append(gpos(n['tickOn']))
    s = ' '.join('%s:%s' % (DR.get(k,k), ''.join('%x'%i for i in sorted(set(v)))) for k,v in sorted(d.items()))
    print('b%2d %s' % (b, s))
print('--- drums per-section avg per bar')
SEC = [(1,7),(9,16),(17,24),(25,32),(33,40),(41,48),(49,64),(65,78),(79,81)]
for (a,z) in SEC:
    c = Counter()
    for b in range(a,z+1):
        for n in byb.get(b,[]):
            if n['isDrum']: c[n['pitch']] += 1
    tot = z-a+1
    print('sec %2d-%2d ' % (a,z) + ' '.join('%s:%.2f' % (DR.get(k,k), v/tot) for k,v in sorted(c.items())))
