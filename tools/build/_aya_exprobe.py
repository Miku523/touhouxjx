# -*- coding: utf-8 -*-
"""风神少女：从 tools/build/_aya_score.json 还原每通道音符，摸清段落与鼓。"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SC = json.load(open('tools/build/_aya_score.json', encoding='utf-8'))
OR = json.load(open('tools/build/_aya_orig.json', encoding='utf-8'))
bar_sec = SC['bar_sec']
step = SC['step']
bars = SC['bars']
print('bpm %.2f bar_sec %.4f step %.5f bars %d dur %.2f' % (SC['bpm_orig'], bar_sec, step, bars, SC['duration']))
print('orig channels:', {k: (v['prog'], v['notes'], v['median']) for k, v in OR['channels'].items()})

for ch, rows in sorted(SC['ch'].items(), key=lambda kv: int(kv[0])):
    ts = [(r[0] - 1) * bar_sec + r[1] * step for r in rows]
    ms = [r[2] for r in rows]
    print('ch%-3s n=%-5d t=[%7.2f,%7.2f] midi=[%d,%d]' % (ch, len(rows), min(ts), max(ts), min(ms), max(ms)))

# 逐小节顶线 / 活跃通道
print('\nbar  time   chord    top   bass  active')
for b in range(1, min(bars, 110)):
    t0 = (b - 1) * bar_sec
    act = []
    top, bass = 0, 200
    for ch, rows in SC['ch'].items():
        n = [r for r in rows if (r[0] - 1) * bar_sec + r[1] * step >= t0 and (r[0] - 1) * bar_sec + r[1] * step < t0 + bar_sec]
        if n:
            act.append(ch)
            top = max(top, max(r[2] for r in n))
            bass = min(bass, min(r[2] for r in n))
    if b % 2 == 1 or b <= 8:
        print('%3d %6.2f  %-8s %3d   %3d   %s' % (b, t0, SC['chord'][b - 1], top, bass, ','.join(act)))
