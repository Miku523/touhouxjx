# -*- coding: utf-8 -*-
"""原曲《魔法少女達の百年祭》结构分析（只读，不改任何文件）。"""
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M

SRC = 'tools/build/midi/centennial.mid'
mid = M.parse_midi(SRC)
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs)
bar = 4 * 60.0 / bpm
print('bpm %.3f  div %d  bar %.4fs' % (bpm, div, bar))
tmax = 0.0
for ch, d in sorted(chans.items()):
    ns = d['notes']
    if not ns:
        continue
    tmax = max(tmax, max(n['t'] + n['d'] for n in ns))
    pc = Counter(int(n['m']) % 12 for n in ns)
    top = ', '.join('%s:%d' % ('C C# D D# E F F# G G# A A# B'.split()[k], v) for k, v in pc.most_common(5))
    times = [n['t'] for n in ns]
    poly = Counter(round(n['t'], 2) for n in ns)
    print('ch%-2d n=%4d  %7.2f..%7.2f  m %3d..%3d  progs %-10s maxpoly %d  top %s' % (
        ch, len(ns), min(times), max(times), min(n['m'] for n in ns), max(n['m'] for n in ns),
        sorted(d['progs']), max(poly.values()), top))
print('end %.2fs  bars %.2f' % (tmax, tmax / bar))

# 每小节：各通道音数 + ch2 旋律音高序列（同刻取最高）
print('\nbar  t      ' + ' '.join('ch%-2d' % c for c in sorted(chans)))
melbar = defaultdict(list)
for ch in sorted(chans):
    per = defaultdict(int)
    for n in chans[ch]['notes']:
        per[int(n['t'] / bar)] += 1
    chans[ch]['_per'] = per
nbar = int(tmax / bar) + 1
for b in range(nbar):
    row = ['%4d %6.2f' % (b, b * bar)]
    for ch in sorted(chans):
        row.append('%4d' % chans[ch]['_per'].get(b, 0))
    print('  '.join(row))

# 主旋律 ch2 逐小节音高（最高音，逗号连写）
print('\nch2 melody by bar (pitch names):')
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
for b in range(nbar):
    lo, hi = b * bar, (b + 1) * bar
    ns = sorted([n for n in chans[2]['notes'] if lo <= n['t'] < hi], key=lambda n: n['t'])
    if not ns:
        print('%3d | -' % b)
        continue
    best = {}
    for n in ns:
        k = round(n['t'], 2)
        if k not in best or n['m'] > best[k]['m']:
            best[k] = n
    items = sorted(best.values(), key=lambda n: n['t'])
    s = ' '.join('%s%d' % (NAMES[int(n['m']) % 12], int(n['m']) // 12 - 1) for n in items)
    print('%3d | %s' % (b, s))
