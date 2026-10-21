# -*- coding: utf-8 -*-
"""统计原曲旋律层在新编曲和声里的「合拍度」，找出哪些段落适合叠。"""
import json
import os
import sys

BASE = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(BASE, 'tools'))
import aya_stage4 as A

BAR = 240.0 / 154
new = json.load(open(os.path.join(BASE, 'tools', 'build', '_aya_fb.json'), encoding='utf-8'))
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))
lead = [(t, t + d, m) for (t, m, d, v) in new['tracks'][0]['notes']]

SEC = [(0, 8, 'intro'), (8, 24, 'A'), (24, 40, 'B'), (40, 56, 'C'), (56, 72, 'D'), (72, 88, 'E'), (88, 100, 'outro')]
print('%-6s %-6s %s' % ('段', '小节', '原曲音符: 总数 / 在弦内 / 与主旋律撞'))
for (b0, b1, name) in SEC:
    t0, t1 = b0 * BAR, b1 * BAR
    line = []
    for ti, tag in ((0, '主奏'), (2, '副旋')):
        ns = [n for n in old['tracks'][ti]['notes'] if t0 <= n[0] < t1]
        inc = clash = 0
        for (t, m, d, v) in ns:
            ok = {(A.CHORDS[A.prog_at(int(t / BAR))][0] + iv) % 12 for iv in A.CHORDS[A.prog_at(int(t / BAR))][1]}
            if m % 12 in ok:
                inc += 1
            for (s, e, lm) in lead:
                if min(t + d, e) - max(t, s) > 0 and (m - lm) % 12 in (0, 1, 11):
                    clash += 1
                    break
        line.append('%s %d/%d(%d%%) 撞%d' % (tag, len(ns), inc, inc / max(len(ns), 1) * 100, clash))
    print('%-6s %-6s %s' % (name, '%d-%d' % (b0, b1), '  |  '.join(line)))
