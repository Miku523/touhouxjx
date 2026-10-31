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
    return b, round((s - bar_t[b]) / (bar_t[b + 1] - bar_t[b]) * 4, 2)
GM = {35:'kick',36:'kick',37:'sidestick',38:'snare',39:'clap',40:'snareE',41:'tomL',42:'hatC',43:'tomL',44:'hatP',45:'tomM',46:'hatO',47:'tomM',48:'tomH',49:'crash',50:'tomH',51:'ride',52:'china',53:'rideB',55:'splash',57:'crash2',59:'ride2'}
cnt = collections.Counter()
for n in chans[9].get('notes') or []:
    cnt[GM.get(n['m'], 'p'+str(n['m']))] += 1
print('drum map counts:', dict(cnt))
print()
for lo, hi in ((1, 16), (17, 26), (41, 44), (65, 70)):
    print('===== bars %d-%d =====' % (lo, hi))
    for b in range(lo, hi + 1):
        ev = []
        for n in chans[9].get('notes') or []:
            bb, bt = sec2barbeat(n['t'])
            if bb == b:
                ev.append((bt, GM.get(n['m'], 'p%d' % n['m']), n['v']))
        ev.sort()
        print('bar %3d: %s' % (b, ' '.join('%s@%g(%d)' % (k, t, v) for t, k, v in ev)))
