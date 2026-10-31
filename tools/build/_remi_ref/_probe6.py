# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
# weighted onset histogram mod 1920
h = Counter()
for n in ns:
    h[n['tickOn'] % 1920] += n['vel']
print('weighted onsets mod1920, top 20:')
for k,v in h.most_common(20): print('  %4d (%5.2f beat) w=%d' % (k, k/480.0, v))
print()
# chord-change detection via ch13 piano lowest notes per bar
n13 = [n for n in ns if n['ch']==13]
print('ch13 (piano low) first note each bar, bars 0-30:')
for b in range(0, 31):
    sel=[n for n in n13 if n['bar']==b]
    if sel:
        low = min(sel, key=lambda n:n['pitch'])
        print('  bar%3d lowest %s at raw %d (%.2f beat)' % (b, M.pname(low['pitch']), low['tickOn']%1920, (low['tickOn']%1920)/480.0))
