# -*- coding: utf-8 -*-
"""v8 体检：旋律落点与原曲的一致性 + 副旋律密度（每秒音符数）。"""
import json
import os

ROOT = r'C:\Users\GuSheng\Downloads\HKS'
D = json.load(open(os.path.join(ROOT, 'tools/build/_aya_score.json'), encoding='utf-8'))
CH = {int(k): v for k, v in D['ch'].items()}
src_step = D['step']                       # 原曲 154 BPM 的 16 分步长

song = json.load(open(os.path.join(ROOT, 'tools/build/_aya_song.json'), encoding='utf-8'))
BPM = song['bpm']
BAR = 240.0 / BPM
STEP = BAR / 16
lead = song['tracks'][0]['notes']
wind = song['tracks'][1]['notes']

SECS = [('intro', 0, 8, None), ('A', 8, 24, 13), ('B', 24, 40, 29),
        ('C', 40, 56, 52), ('D', 56, 72, 84), ('E', 72, 88, 13),
        ('outro', 88, 100, None)]

print('节拍 %.1f  16 分步长 %.4fs（原曲 %.4fs）' % (BPM, STEP, src_step))
print('%-6s %-10s %-12s %-12s' % ('段', '起始秒', '旋律对齐误差', '风轮音符/秒'))
for name, b0, b1, sb in SECS:
    nb = b1 - b0
    # 风轮密度
    wn = [n for n in wind if b0 * BAR <= n[0] < b1 * BAR]
    dens = len(wn) / ((b1 - b0) * BAR)
    err = '-'
    if sb is not None:
        # 原曲旋律（ch1）相对段落起点的时刻 vs 本编曲 melody 时刻
        so = sorted({round(si * src_step + (b - sb) * 16 * src_step, 3)
                     for b, si, m, ls, v in CH.get(1, []) if sb <= b < sb + nb})
        mo = sorted({round(n[0] - b0 * BAR, 3) for n in lead
                     if b0 * BAR - 1e-6 <= n[0] < b1 * BAR})
        near = [min(abs(x - y) for y in mo) for x in so] if mo else [9]
        err = '中位 %.0fms / 最大 %.0fms' % (
            sorted(near)[len(near) // 2] * 1000, max(near) * 1000)
    print('%-6s %-9.1f %-14s %-9.1f' % (name, b0 * BAR, err, dens))
