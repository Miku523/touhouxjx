# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')

def rep(tag, fn, watch, step=4):
    midi = M.parse_midi(os.path.join(BASE, fn))
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs); spb = 60.0 / bpm * 4.0
    end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    nbar = int(end / spb) + 1
    print('=' * 100)
    print('%s bpm=%s end=%.2fs bars=%d  音符数: %s' % (tag, bpm, end, nbar,
          {ch: len(chans[ch]['notes']) for ch in sorted(chans) if chans[ch]['notes']}))
    print('bar块 | ' + '  '.join('ch%02d' % ch for ch in watch))
    for b0 in range(0, nbar + step, step):
        cells = []
        for ch in watch:
            c = sum(1 for n in chans[ch]['notes'] if b0 * spb <= n['t'] < (b0 + step) * spb)
            cells.append('%4d' % c)
        print('%3d-%-3d| %s' % (b0 + 1, min(nbar, b0 + step), ' '.join(cells)))

rep('pre1 honou', '2. A Soul that is Red, like a Ground Cherry (ZUN).mid', [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12])
rep('stage1 youma', '3. Apparitions Stalk the Night (ZUN).mid', [1, 2, 3, 5, 6, 7, 8, 10])
