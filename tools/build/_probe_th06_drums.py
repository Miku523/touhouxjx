# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
for fn in ['2. A Soul that is Red, like a Ground Cherry (ZUN).mid',
           '3. Apparitions Stalk the Night (ZUN).mid']:
    midi = M.parse_midi(os.path.join(BASE, fn))
    chans, segs, div = M.extract_channels(midi)
    print('=' * 70)
    print(fn)
    print('  鼓 pitch 分布:', dict(Counter(n['m'] for n in chans[9]['notes'])))
    print('  DRUM_MAP:', M.DRUM_MAP)
    allt = sorted(n['t'] for c in chans.values() for n in c['notes'])
    print('  首音 %.3fs  末音 %.3fs  音符总数 %d' % (allt[0], allt[-1], len(allt)))
    # 每通道首末音
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if ns:
            print('  ch%02d  %.2f..%.2f' % (ch, min(n['t'] for n in ns), max(n['t'] + n['d'] for n in ns)))
