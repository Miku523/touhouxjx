#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时诊断：解析生成好的 touhou.js，检查指定曲目的
- 每 8 秒窗口的音符数 / 中位音高（找段落问题）
- 全曲最大同时发声数（评估合成器削波风险）
- lead 的相邻音程跳进（>12 半音的突变）
用法：python tools/build/check_gen.py [stage1 stage3 extra]
"""
import json
import re
import sys

SRC = 'src/engine/songs/touhou.js'
songs = sys.argv[1:] or ['stage1', 'stage3', 'extra']
text = open(SRC, encoding='utf-8').read()


def song_block(key):
    m = re.search(r'\n  %s: \{\n' % re.escape(key), text)
    nxt = re.search(r'\n  (\w+): \{\n', text[m.end():])
    end = m.end() + nxt.start() if nxt else len(text)
    return text[m.start():end]


for key in songs:
    blk = song_block(key)
    dur = float(re.search(r'duration: ([\d.]+)', blk).group(1))
    tracks = re.findall(r"\{ wave: '(\w+)', gain: ([\d.]+), notes: (\[\[.*?\]\]) \}",
                        blk, re.S)
    drums_s = re.search(r'drums: (\[\[.*?\]\])', blk, re.S).group(1)
    tracks = [(w, float(g), json.loads(n)) for w, g, n in tracks]
    drums = json.loads(drums_s)
    lead = tracks[0][2]
    print('\n=== %s  duration=%.2fs tracks=%d drums=%d' % (key, dur, len(tracks), len(drums)))

    # 每 8s 窗口
    win = 8.0
    nwin = int(dur // win) + 1
    line = []
    for i in range(nwin):
        a, b = i * win, (i + 1) * win
        ns = [n for n in lead if a <= n[0] < b]
        if not ns:
            line.append('%d-%d:--' % (a, b))
            continue
        med = sorted(n[1] for n in ns)[len(ns) // 2]
        line.append('%d-%d:%dt/%d' % (a, b, len(ns), med))
    for i in range(0, len(line), 7):
        print('   ' + '  '.join(line[i:i + 7]))

    # 最大同时发声（所有轨道 + 鼓不计）
    ev = []
    for w, g, ns in tracks:
        for t, m, d, v in ns:
            ev.append((t, 1))
            ev.append((t + d, -1))
    ev.sort()
    cur = mx = 0
    for t, delta in ev:
        cur += delta
        mx = max(mx, cur)
    print('   max_simul_voices=%d' % mx)

    # lead 大跳
    leaps = []
    for (t0, m0, *_),(t1, m1, *_ ) in zip(lead, lead[1:]):
        if abs(m1 - m0) > 17 and t1 - t0 < 2.0:
            leaps.append((round(t0, 1), m0, round(t1, 1), m1))
    print('   lead leaps>17 semi: %d %s' % (len(leaps), leaps[:6]))
