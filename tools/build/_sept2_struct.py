# -*- coding: utf-8 -*-
"""Septette MIDI 结构：拍/小节网格、各通道进出、ch9 鼓型"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID); div = midi['division'] or 480
notes = {}; pending = {}
for tr in midi['tracks']:
    for ev in tr['events']:
        if ev[1] == 'on' and ev[4] > 0:
            pending.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pending.get((ev[2], ev[3]))
            if st:
                on, vel = st.pop(0)
                notes.setdefault(ev[2], []).append((on, max(ev[0], on+1), ev[3], vel))
secs = M.extract_channels(midi)[1]
print('division', div, 'tempo segs', len(secs), '首段 uspq', secs[0])
def tick_to_beats(t): return t / div
for ch in sorted(notes):
    ns = sorted(notes[ch])
    print('ch%-2d 音数 %5d  拍 %.2f-%.2f  音域 %d-%d' % (ch, len(ns), tick_to_beats(ns[0][0]), tick_to_beats(ns[-1][1]),
          min(n[2] for n in ns), max(n[2] for n in ns)))
# ch9 鼓：按 3 拍小节的 mod 3 分布
d = sorted(notes.get(9, []))
from collections import Counter
c = Counter()
for on, offt, m, v in d:
    bb = tick_to_beats(on)
    c[(m, round(bb % 3, 2))] += 1
print('鼓型（音高 -> 拍内位置:次数）')
for (m, b), n in sorted(c.items()):
    if n >= 5:
        print('   m=%d  拍内 %.2f  x%d' % (m, b, n))
# 主旨：每 4 小节统计各通道音数（3 拍/小节）
print('每 4 小节各通道音数（3/4）：')
bars = int(max(n[1] for ns in notes.values() for n in ns) / div / 3) + 2
for k in range(0, bars, 4):
    row = []
    for ch in sorted(notes):
        if ch == 9: continue
        cnt = sum(1 for on, offt, m, v in notes[ch] if k*3*div <= on < (k+4)*3*div)
        row.append('%d:%d' % (ch, cnt) if cnt else '')
    print('  小节 %3d-%3d %s' % (k, k+4, ' '.join(x for x in row if x)))