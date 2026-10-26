# -*- coding: utf-8 -*-
"""在指定通道里找四音动机：base, base-1, base+2, base+1（B-A-C-H 型）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
path = sys.argv[1]
chans, segs, div = extract_channels(parse_midi(path))
hits = {}
for ch, c in chans.items():
    if ch == 9:
        continue
    mono = {}
    for n in c['notes']:
        k = round(n['t'], 2)
        if k not in mono or n['m'] > mono[k]['m']:
            mono[k] = n
    seq = [mono[k] for k in sorted(mono)]
    for i in range(len(seq) - 3):
        a, b, c2, d = (x['m'] for x in seq[i:i + 4])
        if b == a - 1 and c2 == a + 2 and d == a + 1 and seq[i + 3]['t'] - seq[i]['t'] < 2.6:
            key = '%s-%s-%s-%s' % (NAMES[a % 12], NAMES[b % 12], NAMES[c2 % 12], NAMES[d % 12])
            hits.setdefault(key, []).append((ch, round(seq[i]['t'], 2)))
for key in sorted(hits, key=lambda k: -len(hits[k])):
    v = hits[key]
    print('%-12s x%-3d  ch%s  t=%s' % (key, len(v), sorted(set(x[0] for x in v)), [x[1] for x in v[:6]]))
