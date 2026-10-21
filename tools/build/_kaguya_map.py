# -*- coding: utf-8 -*-
"""判断游戏内 stage6 三条轨分别来自 MIDI 哪个通道（用于定位主旋律通道）。"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
orig = json.load(open(os.path.join(ROOT, 'tools', 'build', '_stage6_orig.json'), encoding='utf-8'))
mid = json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_orig.json'), encoding='utf-8'))

OFFSET = 9.375  # 5 小节（128BPM，1.875s/小节）


def key(n):
    return (round(n[0] * 8) / 8, n[1])


def match(trk_notes, ch_notes, off):
    a = {(round((t) * 8) / 8, m) for t, m, d, v in trk_notes}
    b = {(round((t - off) * 8) / 8, m) for t, m, d, v in ch_notes}
    hit = len(a & b)
    return hit, len(a), len(b), hit / max(1, len(a))


for ti, trk in enumerate(orig['tracks']):
    notes = trk['notes']
    print('== 游戏轨 %d (%s, %d 音, 中位 %d)' % (ti, trk['wave'], len(notes), trk['med'] if 'med' in trk else 0))
    rows = []
    for ch, ns in mid['notes'].items():
        hit, na, nb, r = match(notes, ns, OFFSET)
        rows.append((r, ch, hit, len(ns)))
    for r, ch, hit, nb in sorted(rows, reverse=True)[:5]:
        print('   ch%-3s 命中 %4d/%d = %5.1f%%  (该通道 %d 音)' % (ch, hit, len(notes), r * 100, nb))

# 也测其它偏移
print('\n== ch0 与游戏轨0 在不同偏移下的命中率')
for off in [0, 3.75, 7.5, 9.375, 11.25, 15.0]:
    hit, na, nb, r = match(orig['tracks'][0]['notes'], mid['notes']['0'], off)
    print('   offset %6.3fs -> %5.1f%% (%d/%d)' % (off, r * 100, hit, na))
