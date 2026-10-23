# -*- coding: utf-8 -*-
import sys, os
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
midi = M.parse_midi(os.path.join(BASE, '2. A Soul that is Red, like a Ground Cherry (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)
spb = 60.0 / 145.0 * 4.0
for lo, hi, tag in [(44, 49, 'bridge'), (48, 54, 'outro')]:
    print('=' * 60, tag)
    for ch in (5, 3, 6, 2, 7):
        ns = [n for n in chans[ch]['notes'] if lo * spb <= n['t'] < hi * spb]
        if not ns:
            print('ch%02d none' % ch); continue
        ns.sort(key=lambda n: (n['t'], n['m']))
        print('ch%02d %d notes v=%s' % (ch, len(ns), sorted(set(int(n['v']) for n in ns))))
        print('   ' + ' '.join('%d:%.2f/%.2f/v%d' % (n['m'], n['t'], n['d'], n['v']) for n in ns[:30]))
