# -*- coding: utf-8 -*-
"""用贝斯根音变化点判断 Septette (ZUN) 的小节长度（3 拍 vs 4 拍）。"""
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

def roots(notes):
    """按 8 分网格取当前最低音（= 贝斯根音）。"""
    grid = beat / 2
    t0 = min(n['t'] for n in notes); t1 = max(n['t'] + n['d'] for n in notes)
    out = []
    t = t0
    while t < t1:
        cand = [n for n in notes if n['t'] - 0.03 <= t < n['t'] + n['d']]
        out.append((t, min(n['m'] for n in cand) if cand else None))
        t += grid
    return out

bass = chans[13]['notes'] + chans[1]['notes']
bs = roots(bass)
changes = []
prev = None
for t, m in bs:
    if m is not None and m != prev:
        changes.append(t); prev = m
print('根音变化点 %d 个（前 20：%s）' % (len(changes), ['%.2f' % x for x in changes[:20]]))

for meter in (3, 4, 2, 6):
    bar = beat * meter
    errs = []
    for t in changes:
        ph = (t % bar) / bar
        errs.append(min(ph, 1 - ph))
    errs.sort()
    med = errs[len(errs)//2]
    print('%d 拍/小节 (bar=%.4fs, 全曲 %.1f 小节)：变化点到小节线 中位偏差 %.3f 小节' % (
        meter, bar, 134.59 / bar, med))
