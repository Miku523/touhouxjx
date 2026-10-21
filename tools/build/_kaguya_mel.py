# -*- coding: utf-8 -*-
"""把 ch0（主旋律）按 16 分格 dump 成谱面，并统计 ch0 覆盖率 / ch12 和声归属。"""
import json
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
mid = json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_orig.json'), encoding='utf-8'))
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
BAR = mid['bar_sec']
STEP = mid['step']


def nm(m):
    return NAMES[m % 12] + str(m // 12 - 1)


def grid(ch, b0=0, b1=86):
    ns = [[t, m, d, v] for t, m, d, v in mid['notes'][str(ch)]]
    rows = {}
    for t, m, d, v in ns:
        b = int(t / BAR)
        if not (b0 <= b < b1):
            continue
        s = int(round((t - b * BAR) / STEP))
        rows.setdefault(b, []).append((s, m, round(d / STEP), v))
    return rows


def dump(ch, b0, b1):
    print('\n==== ch%d 谱面（bar %d-%d），N=音名，后面括号是 16 分长度 ====' % (ch, b0, b1 - 1))
    rows = grid(ch, b0, b1)
    for b in range(b0, b1):
        items = sorted(rows.get(b, []))
        if not items:
            print('bar%-3d (空)' % (b + 1))
            continue
        parts = []
        for s, m, ln, v in items:
            parts.append('%s:%s(%d)v%d' % (s, nm(m), ln, v))
        print('bar%-3d %s' % (b + 1, '  '.join(parts)))


dump(0, 5, 30)
