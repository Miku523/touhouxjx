# -*- coding: utf-8 -*-
import sys, os, bisect
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels, tick_to_sec
MID = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/6 - The Embodiment of Scarlet Devil/13. Septette for a Dead Princess (ZUN).mid'
m = parse_midi(MID)
chans, segs, div = extract_channels(m)
bar_ticks = div * 4
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(p): return names[p % 12] + str(p // 12 - 1)
bar_t = [tick_to_sec(segs, div, b * bar_ticks) for b in range(0, 92)]
def sec2barbeat(s):
    b = bisect.bisect_right(bar_t, s) - 1
    return b, round((s - bar_t[b]) / (bar_t[b + 1] - bar_t[b]) * 4, 2)
for ch in (3, 5, 12, 6, 7, 14):
    print('########## ch%d ##########' % ch)
    cur = None; parts = []
    for n in sorted(chans[ch].get('notes') or [], key=lambda x: x['t']):
        b, bt = sec2barbeat(n['t'])
        if cur is None or b != cur:
            if cur is not None: print('bar %3d: %s' % (cur, ' '.join(parts)))
            cur = b; parts = []
        parts.append('%s@%g' % (nm(n['m']), bt))
    if cur is not None: print('bar %3d: %s' % (cur, ' '.join(parts)))
