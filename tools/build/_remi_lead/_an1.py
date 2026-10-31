# -*- coding: utf-8 -*-
import sys, os, json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels, tick_to_sec, bpm_of
MID = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/6 - The Embodiment of Scarlet Devil/13. Septette for a Dead Princess (ZUN).mid'
m = parse_midi(MID)
chans, segs, div = extract_channels(m)
# tempo map: segs = [tick, sec, usPerBeat]
print('tempo map (%d events):' % len(segs))
bar_ticks = div * 4
for i, (tk, sec, us) in enumerate(segs):
    print('  %2d tick=%6d bar=%.2f sec=%8.3f bpm=%.2f' % (i, tk, tk / float(bar_ticks), sec, 60000000.0 / us))

# bar grid from tempo map: use tick->sec per segment interpolate
def tick2sec(tk):
    for i in range(len(segs) - 1, -1, -1):
        t0, s0, us = segs[i]
        if tk >= t0:
            return s0 + (tk - t0) * (us / 1000000.0) / div
    return 0.0
bar_t = [tick2sec(b * bar_ticks) for b in range(0, 90)]
print('bars', [round(bar_t[b] - bar_t[1], 2) for b in range(1, 85)])
# pitches per channel per bar (counts + lowest/highest)
grid = collections.defaultdict(lambda: collections.defaultdict(list))
for ch, c in chans.items():
    for n in c.get('notes') or []:
        b = int(round(n['t'] / 1.0))  # placeholder
# per-bar from tick? notes store t as sec. Map sec->bar by search
import bisect
def sec2bar(s):
    i = bisect.bisect_right(bar_t, s) - 1
    return i
for ch, c in chans.items():
    for n in c.get('notes') or []:
        b = sec2bar(n['t'])
        grid[ch][b].append(n['m'])
# key histogram (all + per section)
h = collections.Counter()
for ch, c in chans.items():
    for n in c.get('notes') or []:
        h[n['m'] % 12] += 1
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print('pc hist all:', sorted([(names[k], v) for k, v in h.items()], key=lambda x: -x[1]))
# channel activity per bar (first 84)
print()
print('bar | ' + ' '.join('%4d' % ch for ch in sorted(chans)))
for b in range(1, 85):
    row = []
    for ch in sorted(chans):
        row.append(len(grid[ch].get(b, [])))
    print('%3d | ' % b + ' '.join('%4d' % v for v in row))
json.dump({'bar_t': bar_t, 'bpm': 60000000.0 / segs[-1][2]}, open(os.path.join(ROOT, 'tools/build/_remi_lead/_bars.json'), 'w'))
