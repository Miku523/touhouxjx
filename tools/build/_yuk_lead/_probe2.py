# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/7 - Perfect Cherry Blossom'
m = M2.parse_midi(os.path.join(BASE, '18. Necrofantasia (ZUN).mid'))
ev = m['tracks'][0]['events']
from collections import Counter
print(Counter(e[1] for e in ev))
tempos = [e for e in ev if e[1] == 'tempo']
print('tempos', len(tempos), tempos[:8])
ons = [e for e in ev if e[1] == 'on' and not (len(e) > 4 and e[4] == 0)]
print('on len sample', ons[:3], ons[-2:])
print('channels', sorted({e[2] for e in ons}))
print('endtick', ev[-1][0])
