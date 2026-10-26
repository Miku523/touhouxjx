# -*- coding: utf-8 -*-
"""找风神少女的结构重复点：以和弦 + 顶线音高比较，选出可无缝循环的窗口。"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SC = json.load(open('tools/build/_aya_score.json', encoding='utf-8'))
bar_sec, step, bars = SC['bar_sec'], SC['step'], SC['bars']
chord = SC['chord']

# 每小节顶线（不含鼓通道 9）与贝斯
top, bass = {}, {}
for ch, rows in SC['ch'].items():
    if ch == '9':
        continue
    for r in rows:
        b = r[0]
        top[b] = max(top.get(b, 0), r[2])
        bass[b] = min(bass.get(b, 200), r[2])


def sig(b):
    return (chord[b - 1], round(top.get(b, 0) / 12), round(bass.get(b, 0) / 12))


def score(a, n):
    s = 0
    for i in range(n):
        if a + i > bars or i + 1 > bars:
            break
        if sig(i + 1) == sig(a + i):
            s += 1
    return s


print('bar%4s  chord      top bass   match  (与开头逐小节同和弦/同顶线/同低音的比例)')
for k in range(8, bars, 4):
    print('%5d  %-9s %3d %4d   %.2f' % (k, chord[k - 1], top.get(k, 0), bass.get(k, 0), score(k, 16) / 16.0))

print('\n--- 前 4 小节 chord 序列，用于人工判断回环点')
for k in range(1, min(20, bars)):
    print(k, chord[k - 1], top.get(k, 0), bass.get(k, 0))
