# -*- coding: utf-8 -*-
"""只看指定通道的调估计（排除伴奏/低音干扰）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels
from _ex_key import MAJ, MIN, NAMES, score

def run(path, chs):
    chans, segs, div = extract_channels(parse_midi(path))
    for ch in chs:
        if ch not in chans:
            continue
        h = [0.0] * 12
        for n in chans[ch]['notes']:
            h[n['m'] % 12] += max(0.02, n['d'])
        s = sum(h) or 1.0
        h = [x / s for x in h]
        out = []
        for t in range(12):
            out.append((score(h, MAJ, t), NAMES[t] + 'maj'))
            out.append((score(h, MIN, t), NAMES[t] + 'min'))
        out.sort(reverse=True)
        print('  ch%-2d %s' % (ch, '  '.join('%.3f %s' % (a, b) for a, b in out[:4])))

if __name__ == '__main__':
    print(sys.argv[2])
    run(sys.argv[1], [int(x) for x in sys.argv[3].split(',')])
