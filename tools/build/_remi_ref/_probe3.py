# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
print('n', len(ns), 'first tick', ns[0]['tickOn'], 'bar', ns[0]['bar'], 'beat', round(ns[0]['beat'],3))
for c in (1,2,3,8,9,13):
    sub = [n for n in ns if n['ch']==c]
    f = min(sub, key=lambda n:n['tickOn'])
    print('ch',c,'firstbar0',f['bar'],'beat',round(f['beat'],3),'tick',f['tickOn'],'pitch',M.pname(f['pitch']))
# tick offsets modulo 480 for first 200 notes
from collections import Counter
c1 = Counter(n['tickOn']%480 for n in ns[:400])
print('mod480 top', c1.most_common(8))
# check for a global grid offset: histogram of tickOn % 120
c2 = Counter(n['tickOn']%120 for n in ns)
print('mod120 top', c2.most_common(10))
print('bars start ticks', [ (b['idx'], b['startTick']) for b in g['bars'][:5]])
# song tempo at each bar
tmap = g['tmap']
for t,u in tmap:
    print('tempo tick',t,'bar', t//1920, 'bpm', round(60e6/u,3))
