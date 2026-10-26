# -*- coding: utf-8 -*-
"""打印某通道在时间窗内的音序（看 B-A-C-H 之类主题动机搬到了什么调上）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
path, ch, t0, t1 = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
chans, segs, div = extract_channels(parse_midi(path))
ns = [n for n in chans[ch]['notes'] if t0 <= n['t'] <= t1]
ns.sort(key=lambda n: n['t'])
for n in ns:
    print('%6.2f  %-4s dur %.2f  vel %d' % (n['t'], NAMES[n['m'] % 12] + str(n['m'] // 12 - 1), n['d'], n['v']))
