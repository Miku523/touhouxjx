# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
midi = M.parse_midi(os.path.join(BASE, '3. Apparitions Stalk the Night (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)
spb = 60.0 / 146.0 * 4.0
ns = sorted(chans[9]['notes'], key=lambda n: n['t'])
for lo, hi in [(28.2, 31.5), (33.0, 36.5)]:
    sel = [n for n in ns if lo <= n['t'] < hi]
    print('--- %.1f..%.1f ---' % (lo, hi))
    print(' '.join('%d@%.2f(v%d)' % (n['m'], n['t'], n['v']) for n in sel[:60]))
    # 相对拍位置
    pos = Counter()
    for n in sel:
        beat = (n['t'] / spb) * 4.0
        pos[(n['m'], round((beat % 1.0), 2))] += 1
    print('  pitch -> 拍内位置分布:', {k: v for k, v in sorted(pos.items())})
