# -*- coding: utf-8 -*-
"""ch9 鼓型细节：按 3 拍小节统计各音高落在拍内什么位置（找小节线偏移）"""
import os, sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID); div = midi['division'] or 480
hits = []
pending = {}
for tr in midi['tracks']:
    for ev in tr['events']:
        if ev[1] == 'on' and ev[2] == 9 and ev[4] > 0:
            pending.setdefault(ev[3], []).append((ev[0], ev[4]))
        elif ev[1] == 'off' and ev[2] == 9:
            st = pending.get(ev[3])
            if st:
                on, v = st.pop(0)
                hits.append((on, ev[3], v))
print('鼓击', len(hits))
c = Counter()
for on, m, v in hits:
    c[(m, round((on / div) % 3.0, 2))] += 1
for m in (36, 37, 38, 40, 42, 44, 46, 49, 51, 57):
    row = [(b, n) for (mm, b), n in sorted(c.items()) if mm == m]
    if row:
        print('m=%-3d %s' % (m, ' '.join('%.2f:%d' % (b, n) for b, n in row)))
