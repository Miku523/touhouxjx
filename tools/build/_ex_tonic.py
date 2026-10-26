# -*- coding: utf-8 -*-
"""看每首曲子最后落在哪个音/和弦上（判断调中心最稳的办法）。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from midi2js import parse_midi, extract_channels
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def pc(m):
    return NAMES[m % 12] + str(m // 12 - 1)


def show(path, tag):
    chans, segs, div = extract_channels(parse_midi(path))
    end = 0.0
    for ch, c in chans.items():
        for n in c['notes']:
            end = max(end, n['t'] + n['d'])
    print('%s  末 %.2fs' % (tag, end))
    for ch in sorted(chans):
        if ch == 9:
            continue
        ns = [n for n in chans[ch]['notes'] if n['t'] + n['d'] > end - 6.0]
        if not ns:
            continue
        ns.sort(key=lambda n: n['t'])
        prog = chans[ch]['progs']
        print('   ch%-2d prog%-3s  %s' % (ch, max(prog, key=prog.get) if prog else '-',
                                          ' '.join('%s@%.1f' % (pc(n['m']), n['t']) for n in ns[-8:])))
    # 最后一次贝斯
    bass = min(chans, key=lambda c: sum(n['m'] for n in chans[c]['notes']) / max(1, len(chans[c]['notes'])))
    ns = sorted(chans[bass]['notes'], key=lambda n: n['t'])
    print('   低音通道 ch%d 最后 10 音: %s' % (bass, ' '.join('%s@%.1f/%.1f' % (pc(n['m']), n['t'], n['d']) for n in ns[-10:])))


if __name__ == '__main__':
    show(sys.argv[1], sys.argv[2])
