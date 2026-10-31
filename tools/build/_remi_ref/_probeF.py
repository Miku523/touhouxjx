# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
DR={36:'K',38:'S',40:'S2',37:'R',41:'T',42:'h',44:'h2',46:'H',49:'C',51:'Rd',48:'T2',45:'t',43:'f'}
for b in range(8, 14):
    sub=sorted([n for n in ns if n['ch']==9 and n['bar']==b], key=lambda n:n['tickOn'])
    print('bar %2d: ' % b + ' '.join('%s@%d' % (DR.get(n['pitch'],str(n['pitch'])), n['tickOn']%1920) for n in sub))
print()
print('same, grouped per 120-tick 16th bin (X = 16th index from bar line):')
for b in range(8, 14):
    sub=[n for n in ns if n['ch']==9 and n['bar']==b]
    bins={}
    for n in sub: bins.setdefault((n['tickOn']%1920-80)//120, []).append(DR.get(n['pitch'],'?'))
    print('bar %2d: ' % b + ' | '.join('%2d:%s' % (k, ','.join(v)) for k,v in sorted(bins.items())))
