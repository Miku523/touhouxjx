# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
byb = {}
for n in ns: byb.setdefault(n['bar'], []).append(n)
for b in range(0, 6):
    print('===== bar index %d =====' % b)
    for n in sorted(byb.get(b, []), key=lambda x:(x['tickOn'], x['ch'])):
        pos = n['tickOn'] % 1920
        print('  tick%6d pos%4d (%6.3f) ch%2d %-4s vel%3d dur%4d' % (n['tickOn'], pos, pos/480.0, n['ch'], M.pname(n['pitch']), n['vel'], n['tickOff']-n['tickOn']))
