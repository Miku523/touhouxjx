# -*- coding: utf-8 -*-
import sys, os
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
midi = M.parse_midi(os.path.join(BASE, '2. A Soul that is Red, like a Ground Cherry (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)
bpm = 145.0; spb = 60.0 / bpm * 4.0

def show(ch, b0, b1, label):
    ns = [n for n in chans[ch]['notes'] if b0 * spb <= n['t'] < b1 * spb]
    ns.sort(key=lambda n: (n['t'], n['m']))
    out = []
    for n in ns[:40]:
        out.append('%d:%.2f/%.2f/v%d/p%d' % (n['m'], n['t'], n['d'], n['v'], n['p']))
    print('ch%02d %s (%d notes) bar%d-%d start %.2fs' % (ch, label, len(ns), b0, b1, b0 * spb))
    print('   ' + ' '.join(out))

show(5, 13, 17, 'trumpet lead A')
show(3, 29, 33, 'horn lead B')
show(6, 37, 41, 'piano C')
show(12, 37, 41, 'piano12 C')
show(14, 37, 41, 'piano14 C')
show(6, 13, 17, 'piano as accomp A')
show(4, 13, 17, 'epiano A')
show(8, 13, 17, 'marimba A')
show(10, 13, 17, 'guitar10 A')
show(11, 13, 17, 'guitar11 A')
