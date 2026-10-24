# -*- coding: utf-8 -*-
"""用 Krumhansl-Kessler 音级轮廓估计 MIDI 的调（用于核对扒谱是否移过调）。"""
import sys, glob, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels

MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def hist(path):
    midi = parse_midi(path)
    chans, segs, div = extract_channels(midi)
    h = [0.0] * 12
    for ch, c in chans.items():
        if ch == 9:
            continue
        for n in c['notes']:                      # {'t','d','m','v','p'}
            d = max(0.02, n['d'])
            h[n['m'] % 12] += d * (0.4 + 0.6 * n['v'] / 127.0)
    s = sum(h) or 1.0
    return [x / s for x in h]


def score(h, prof, tonic):
    p = [prof[(i - tonic) % 12] for i in range(12)]
    mh = sum(h) / 12.0
    mp = sum(p) / 12.0
    num = sum((h[i] - mh) * (p[i] - mp) for i in range(12))
    den = (sum((h[i] - mh) ** 2 for i in range(12)) * sum((p[i] - mp) ** 2 for i in range(12))) ** 0.5
    return num / den if den else 0.0


def best(path):
    h = hist(path)
    out = []
    for t in range(12):
        out.append((score(h, MAJ, t), NAMES[t] + ' major'))
        out.append((score(h, MIN, t), NAMES[t] + ' minor'))
    out.sort(reverse=True)
    return out[:3]


if __name__ == '__main__':
    for path in sys.argv[1:]:
        print(os.path.basename(path))
        for sc, k in best(path):
            print('   %.3f  %s' % (sc, k))
