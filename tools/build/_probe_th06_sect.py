# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')

def report(tag, fn, watch, bars_per_row=4):
    midi = M.parse_midi(os.path.join(BASE, fn))
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    sec_per_bar = 60.0 / bpm * 4.0
    end_sec = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    nbar = int(end_sec / sec_per_bar) + 1
    print('=' * 100)
    print('%s  bpm=%s  end=%.3fs  bars=%d' % (tag, bpm, end_sec, nbar))
    print('bar | ' + '  '.join('ch%02d' % ch for ch in watch))
    rows = {}
    for ch in watch:
        per = Counter()
        for n in chans[ch]['notes']:
            per[int(n['t'] / sec_per_bar)] += 1
        rows[ch] = per
    for b in range(nbar):
        line = ' '.join('%4d' % rows[ch].get(b, 0) for ch in watch)
        mark = ' *' if any(rows[ch].get(b, 0) for ch in watch[:3]) else ''
        print('%3d | %s%s' % (b + 1, line, mark))

report('pre1 honou', '2. A Soul that is Red, like a Ground Cherry (ZUN).mid', [3, 5, 6, 7, 12])
report('stage1 youma', '3. Apparitions Stalk the Night (ZUN).mid', [2, 3, 5, 6, 10])
