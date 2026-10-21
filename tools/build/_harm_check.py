# -*- coding: utf-8 -*-
"""和声一致性体检：逐 16 分步统计旋律落点与和弦音的关系、声部间半音撞车。"""
import os
import subprocess
import json

ROOT = r'C:\Users\GuSheng\Downloads\HKS'
JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'aya_stage4.js')

song = json.load(open(os.path.join(ROOT, 'tools', 'build', '_aya_song.json'),
                       encoding='utf-8'))

BPM = 168.0
BAR = 240.0 / BPM
STEP = BAR / 16

TR = {t['wave'] + str(i): t['notes'] for i, t in enumerate(song['tracks'])}
lead = TR['square0']
wind = TR['sawtooth1']
bass = TR['triangle2']
pad = TR['sine3']


def prog_at(bar):
    """与 aya_stage4.py 中 PROG_A..D 一致的 16 小节进行（写死便于校验）。"""
    P = {
        'A': ['Fm', 'Eb', 'Dm', 'Dm', 'Fm', 'Eb', 'Dm', 'Fm',
              'Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Edim', 'Fm'],
        'B': ['Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Fm', 'Db',
              'Db', 'Eb', 'Bb', 'Edim', 'Db', 'Eb', 'Fm', 'Fm'],
        'C': ['Fm', 'Fm', 'Eb', 'Dm', 'Dm', 'Fm', 'Eb', 'Dm',
              'Fm', 'Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Edim'],
        'D': ['F#m7', 'D', 'E', 'F#m', 'F#m', 'D', 'E', 'F#m',
              'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m'],
    }
    P['E'] = P['A']
    CH = {'Fm': (5, [0, 3, 7]), 'Eb': (3, [0, 4, 7]), 'Dm': (2, [0, 3, 7]),
          'Db': (1, [0, 4, 7]), 'Bb': (10, [0, 4, 7]), 'Edim': (4, [0, 3, 6]),
          'F#m7': (6, [0, 3, 7, 10]), 'F#m': (6, [0, 3, 7]),
          'D': (2, [0, 4, 7]), 'E': (4, [0, 4, 7])}
    if bar < 8 or bar >= 88:
        return (5, [0, 3, 7, 10])
    sec = 'ABCDEA'[(bar - 8) // 16]
    name = P[sec][(bar - 8) % 16]
    return CH[name]


SECNAME = ['intro', 'A', 'B', 'C', 'D', 'E', 'outro']
rows = []
for si in range(6):
    b0 = si * 16
    hit = tot = 0
    clash = stp = 0
    for bar in range(b0, b0 + 16):
        root, tpl = prog_at(bar)
        tones = {(root + i) % 12 for i in tpl}
        t0 = bar * BAR
        for step in range(16):
            t = t0 + step * STEP
            ons = [n for n in lead if abs(n[0] - t) < STEP * 0.4]
            if ons:
                for n in ons:
                    tot += 1
                    if n[1] % 12 in tones:
                        hit += 1
            # 同时发声的音之间是否有小二度
            act = [n for n in lead + wind + bass + pad
                   if n[0] <= t + 1e-6 < n[0] + n[2]]
            stp += 1
            bad = False
            for i in range(len(act)):
                for j in range(i + 1, len(act)):
                    if abs(act[i][1] - act[j][1]) % 12 in (1, 11):
                        bad = True
            if bad:
                clash += 1
    rows.append((SECNAME[si], b0, hit / max(1, tot), clash / max(1, stp)))

print('%-6s %-6s %-8s %-8s' % ('段', '起小节', '旋律落和弦音', '半音撞车步'))
for name, b0, h, c in rows:
    print('%-6s %-7d %6.1f%% %8.1f%%' % (name, b0, h * 100, c * 100))
