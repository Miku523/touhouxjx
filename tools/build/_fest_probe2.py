# -*- coding: utf-8 -*-
"""编曲前的角色核对：ch4/ch6/ch9/ch10/ch11 在各段落的密度、音域、是否重复（只读）。"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M

SRC = 'tools/build/midi/centennial.mid'
mid = M.parse_midi(SRC)
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs)
bar = 4 * 60.0 / bpm
print('bpm %.3f bar %.4fs' % (bpm, bar))

SECS = [(1, 8, 'intro'), (9, 17, 'A'), (18, 19, 'brk1'), (20, 28, 'B'),
        (29, 33, 'C'), (34, 39, 'D'), (40, 55, 'Ap'), (56, 58, 'brk2'),
        (59, 60, 'gliss'), (61, 76, 'fin1'), (77, 78, 'brk3'), (79, 94, 'fin2')]
NAMES = 'C C# D D# E F F# G G# A A# B'.split()


def nm(m):
    return '%s%d' % (NAMES[int(m) % 12], int(m) // 12 - 1)


for ch in (3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15):
    if ch not in chans:
        continue
    ns = chans[ch]['notes']
    print('\nch%-2d progs %s  n=%d  m %d..%d' % (
        ch, sorted(chans[ch]['progs']), len(ns),
        min(n['m'] for n in ns), max(n['m'] for n in ns)))
    for (b0, b1, tag) in SECS:
        sub = [n for n in ns if b0 <= n['t'] / bar < b1]
        if not sub:
            continue
        per = len(sub) / float(b1 - b0)
        print('  %-6s bars %3d-%-3d n=%4d  %.1f/bar  m %d..%d  vel %d..%d' % (
            tag, b0, b1, len(sub), per, min(n['m'] for n in sub),
            max(n['m'] for n in sub), min(n['v'] for n in sub), max(n['v'] for n in sub)))

# ch14 是否 ch10 的 +12 复印；ch4 61-93 是否 == ch10
def setof(ch, b0, b1):
    return set((round(n['t'], 2), int(n['m'])) for n in chans[ch]['notes']
               if b0 <= n['t'] / bar < b1)

for (a, b, tag) in [(61, 76, 'fin1'), (79, 94, 'fin2')]:
    s10 = setof(10, a, b)
    for ch in (14, 4, 11, 15):
        if ch not in chans:
            continue
        s = setof(ch, a, b)
        same = len(s & s10)
        print('\nch%d 在 %s: n=%d，与 ch10 同(时刻,音高) %d 个' % (ch, tag, len(s), same))
        if 0 < same < len(s):
            print('   仅 ch%d 有: %s' % (ch, sorted(s - s10, key=lambda x: x[0])[:12]))
            print('   仅 ch10 有: %s' % (sorted(s10 - s, key=lambda x: x[0])[:12]))

# ch4 中段长音（20-33）到底几音
sub = [n for n in chans[4]['notes'] if 20 <= n['t'] / bar < 34]
print('\nch4 20-33: %d 音' % len(sub))
for n in sub[:10]:
    print('   %6.2f bar %5.2f  %s  dur %.2f v%d' % (
        n['t'], n['t'] / bar, nm(n['m']), n['d'], n['v']))
