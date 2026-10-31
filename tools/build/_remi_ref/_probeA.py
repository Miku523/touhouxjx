# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
def line(ch, b0, b1):
    print('--- ch%d bars %d-%d ---' % (ch,b0,b1))
    for n in sorted([x for x in ns if x['ch']==ch and b0<=x['bar']<=b1], key=lambda x:x['tickOn']):
        print('   bar%2d pos%4d %-4s v%3d d%4d' % (n['bar'], n['tickOn']%1920, M.pname(n['pitch']), n['vel'], n['tickOff']-n['tickOn']))
line(3, 8, 13)
