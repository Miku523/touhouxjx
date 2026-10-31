# -*- coding: utf-8 -*-
import sys, os, bisect, collections
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
    frac = (s - bar_t[b]) / (bar_t[b + 1] - bar_t[b])
    return b, round(frac * 4, 2)
import sys
lo, hi = int(sys.argv[1]), int(sys.argv[2])
for b in range(lo, hi + 1):
    print('=== bar %d ===' % b)
    for ch in sorted(chans):
        if ch == 9: continue
        ns = [n for n in chans[ch].get('notes') or [] if sec2barbeat(n['t'])[0] == b]
        if not ns: continue
        ss = []
        for n in sorted(ns, key=lambda x: x['t']):
            _, bt = sec2barbeat(n['t'])
            ss.append('%s/%g' % (nm(n['m']), bt))
        print('  ch%-2d %s' % (ch, ' '.join(ss)))
