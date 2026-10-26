# -*- coding: utf-8 -*-
"""打印开头若干小节的贝斯与顶线音（判断绝对调性）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels, build_tempo_map, tick_to_sec
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def pc(m):
    return NAMES[m % 12] + str(m // 12 - 1)


def main(path, nbars=24):
    midi = parse_midi(path)
    chans, segs, div = extract_channels(midi)
    # 小节线：按第一轨 tempo/拍号，粗暴用 4 拍 = div*4 tick，起点取第一个音
    t0 = min(n['t'] for c in chans.values() for n in c['notes'])
    beat = tick_to_sec(segs, div, int(div * (1 + 1e-9))) - tick_to_sec(segs, div, 0)
    bass = None
    for ch, c in chans.items():
        if ch == 9:
            continue
        if bass is None or sum(n['m'] for n in c['notes']) / len(c['notes']) < sum(n['m'] for n in chans[bass]['notes']) / len(chans[bass]['notes']):
            bass = ch
    for b in range(nbars):
        lo = t0 + b * 4 * beat
        hi = lo + 4 * beat
        line = []
        for ch in sorted(chans):
            if ch == 9:
                continue
            ns = [n for n in chans[ch]['notes'] if lo <= n['t'] < hi]
            if not ns:
                continue
            lo_n = min(ns, key=lambda n: n['m'])
            hi_n = max(ns, key=lambda n: n['m'])
            line.append('ch%d %s/%s' % (ch, pc(lo_n['m']), pc(hi_n['m'])))
        print('bar%02d %5.1fs  %s' % (b + 1, lo, '  '.join(line)))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 24)
