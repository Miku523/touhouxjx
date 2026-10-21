# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
mel = sorted([n for n in chans[12]['notes'] if n['m'] >= 55], key=lambda n: n['t'])
ch3 = sorted(chans[3]['notes'], key=lambda n: n['t'])
CONS = {0,3,4,5,7,8,9}
print('t      mel  dur   chord tones      verdict')
for n in mel:
    act = [c['m'] for c in ch3 if c['t'] <= n['t'] + 0.05 < c['t'] + c['d'] + 0.02]
    if not act:
        print('%.2f  %3d  %.2f   (无和弦)' % (n['t'], n['m'], n['d'])); continue
    ivs = sorted(set((n['m'] - a) % 12 for a in act))
    bad = [i for i in ivs if i not in CONS]
    tag = 'dissonant' if bad else ''
    if bad or n['d'] > 1.0:
        print('%.2f  %3d  %.2f   %s   ivs=%s %s' % (n['t'], n['m'], n['d'], sorted(act), ivs, tag))
