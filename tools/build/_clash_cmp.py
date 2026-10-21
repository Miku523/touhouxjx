# -*- coding: utf-8 -*-
"""把「半音撞车率」同时算在原曲 MIDI（ch1 旋律 + ch11 和声 + ch10 贝斯）和我的编曲上，
用同一把尺子比较：两者接近就说明和声没有走样。"""
import json
import os

ROOT = r'C:\Users\GuSheng\Downloads\HKS'
D = json.load(open(os.path.join(ROOT, 'tools/build/_aya_score.json'), encoding='utf-8'))
CH = {int(k): v for k, v in D['ch'].items()}
BPM = 168.0
BAR = 240.0 / BPM
STEP = BAR / 16

song = json.load(open(os.path.join(ROOT, 'tools/build/_aya_song.json'), encoding='utf-8'))
ME = song['tracks']

SECS = [('intro', 0, 8), ('A', 8, 24), ('B', 24, 40), ('C', 40, 56),
        ('D', 56, 72), ('E', 72, 88), ('outro', 88, 100)]
SRC = {'intro': (0, 8), 'A': (13, 29), 'B': (29, 45), 'C': (52, 68),
       'D': (84, 100), 'E': (13, 29), 'outro': (88, 96)}


def clash_rate(notes, b0, nbar):
    """notes: [(t, midi, dur)] 16 分步上是否存在半音同响。"""
    bad = tot = 0
    for bar in range(b0, b0 + nbar):
        for st in range(16):
            t = bar * BAR + st * STEP
            act = [n for n in notes if n[0] <= t + 1e-6 < n[0] + n[2]]
            tot += 1
            hit = False
            for i in range(len(act)):
                for j in range(i + 1, len(act)):
                    if abs(act[i][1] - act[j][1]) % 12 in (1, 11):
                        hit = True
            if hit:
                bad += 1
    return bad / max(1, tot)


print('%-7s %-9s %-9s' % ('段', '原曲', '本编曲'))
for name, b0, b1 in SECS:
    s0, s1 = SRC[name]
    nb = min(b1 - b0, s1 - s0)
    src = []
    for b in range(s0, s0 + nb):
        for chn in (1, 11, 10):
            for (bb, si, m, ls, v) in CH.get(chn, []):
                if bb == b:
                    src.append(((b - s0) * BAR + si * STEP, m,
                                max(1, ls) * STEP))
    mine = []
    for tr in ME:
        for (t, m, dur, v) in tr['notes']:
            if b0 * BAR - 1e-6 <= t < (b0 + nb) * BAR:
                mine.append((t - b0 * BAR, m, dur))
    print('%-7s %7.1f%% %8.1f%%' % (name, clash_rate(src, 0, nb) * 100,
                                    clash_rate(mine, 0, nb) * 100))
