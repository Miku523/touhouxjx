# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
print('pos hist (tickOn % 1920), top 12:', Counter(n['tickOn']%1920 for n in ns).most_common(12))
print('pos hist ((tickOn-80) % 1920):', Counter((n['tickOn']-80)%1920 for n in ns).most_common(12))
# duration histogram (ticks)
print('dur hist:', Counter(n['tickOff']-n['tickOn'] for n in ns).most_common(10))
# ch3 vs ch10 relationship
n3 = [n for n in ns if n['ch']==3]; n10=[n for n in ns if n['ch']==10]
same = sum(1 for a,b in zip(n3,n10) if a['tickOn']==b['tickOn'] and a['tickOff']==b['tickOff'] and a['pitch']-12==b['pitch'])
print('ch3/ch10 pairs identical -12:', same, 'of', len(n3), len(n10))
print()
print('=== ch3+ch10 bars 9-16 (0-based) note list, pos in beats from bar start (raw, minus 80 shift shown as .pos)')
for b in range(9,17):
    sel = [n for n in ns if n['bar']==b and n['ch'] in (3,10)]
    items=[]
    for n in sel:
        pos = (n['tickOn'] - 80 - b*1920)/480.0
        dur = (n['tickOff']-n['tickOn'])/480.0
        items.append('%s%s/%.2f' % (M.pname(n['pitch']), ('ch3' if n['ch']==3 else 'c10'), pos))
    print('bar%3d: %s' % (b, ' '.join(items)))
