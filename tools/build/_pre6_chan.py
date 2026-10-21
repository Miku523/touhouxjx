# -*- coding: utf-8 -*-
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
D = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games', '8 - Imperishable Night')
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for fn in ('13. Voyage 1969 (ZUN).mid', '15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid', '16. Voyage 1970 (yoimutu).mid'):
    p = os.path.join(D, fn)
    print('=====', fn)
    midi = M.parse_midi(p)
    chans, segs, div = M.extract_channels(midi)
    print('  segs', len(segs), 'div', div)
    for ch, c in sorted(chans.items()):
        ns = c['notes']
        if not ns:
            continue
        # 同时刻音数
        g = collections.Counter(round(n['t'], 3) for n in ns)
        poly = sum(g.values()) / max(1, len(g))
        durs = collections.Counter(round(n['d'], 2) for n in ns).most_common(3)
        print('  ch%-2d prog=%-4s n=%-5d poly=%.2f 音域 %d-%d 时长 %s' % (
            ch, c.get('prog'), len(ns), poly, min(n['m'] for n in ns), max(n['m'] for n in ns), durs))
