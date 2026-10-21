# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
import midi2js as M
from collections import Counter
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
for ch in (3, 14, 2, 4, 11):
    ns = sorted(chans[ch]['notes'], key=lambda n: n['t'])
    seg_ = [n for n in ns if 22 <= n['t'] < 34]
    print('ch%d 22-34s: %d 音 音域 %d-%d' % (ch, len(seg_), min(n['m'] for n in seg_), max(n['m'] for n in seg_)))
    print('   ', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in seg_[:24]])
