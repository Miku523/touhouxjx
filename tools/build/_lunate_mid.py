# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid'
mid = M.parse_midi(p); chans, segs, div = M.extract_channels(mid)
def dump(ch, t0, t1, lim=40):
    ns = [n for n in chans[ch]['notes'] if t0 <= n['t'] < t1]
    print(' ch%d %d 音:' % (ch, len(ns)))
    print('  ', ', '.join('%.2f:%d(%.2f)' % (n['t'], n['m'], n['d']) for n in ns[:lim]))
for (t0,t1) in ((45,62),(62,78)):
    print('== %.0f–%.0fs ==' % (t0,t1))
    for ch in (2, 6, 3, 5):
        dump(ch, t0, t1)
