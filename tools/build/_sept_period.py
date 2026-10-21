# -*- coding: utf-8 -*-
"""用贝斯根音序列的自相关找循环周期（判断 3 拍还是 4 拍小节）。"""
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
beat = 60.0 / 145.0
step = beat / 2.0          # 8 分网格
bass = chans[13]['notes'] + chans[1]['notes']
t0 = 15.0
t1 = 120.0
seq = []
t = t0
while t < t1:
    cand = [n for n in bass if n['t'] - 0.02 <= t < n['t'] + n['d']]
    seq.append(min(n['m'] for n in cand) if cand else None)
    t += step
# 把 None 用前值填
filled = []
last = None
for v in seq:
    if v is None:
        v = last
    last = v
    filled.append(v)
seq = filled
mean = sum(seq) / len(seq)
var = sum((v - mean) ** 2 for v in seq) or 1

print('网格步长 %.4fs，样本 %d' % (step, len(seq)))
best = []
for lag in range(2, 60):
    s = sum((seq[i] - mean) * (seq[i + lag] - mean) for i in range(len(seq) - lag)) / var
    best.append((s, lag, lag * step))
for s, lag, sec in sorted(best, reverse=True)[:12]:
    print('lag %2d 格 = %6.3fs = %5.2f 拍 相关 %.3f' % (lag, sec, sec / beat, s))
