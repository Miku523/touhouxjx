# -*- coding: utf-8 -*-
import json, io, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
S = json.load(io.open(os.path.join(HERE, 'song9.json'), encoding='utf-8'))
tr = {t['name']: t for t in S['tracks']}
BAR = 1.5584415584415584

def seq(name, t0, t1):
    return [(round(n[0], 2), n[1]) for n in tr[name]['notes'] if t0 <= n[0] < t1]

# B 段前后半对比
b0, b1 = SEC['B']
half = (b0 + b1) / 2
for nm in ('brass', 'strings', 'bass', 'choir'):
    h1 = seq(nm, b0, half); h2 = seq(nm, half, b1)
    same = sum(1 for i in range(min(len(h1), len(h2))) if h1[i][1] == h2[i][1]) / max(1, min(len(h1), len(h2)))
    print('%-8s B 前半 %3d 音 / 后半 %3d 音  音高序列相同 %.0f%%' % (nm, len(h1), len(h2), same * 100))
    print('   前:', [p for _, p in h1[:14]])
    print('   后:', [p for _, p in h2[:14]])

# 鼓 B 前后半
for half_i, (t0, t1) in enumerate(((b0, half), (half, b1))):
    ev = [e for e in S['drums'] if t0 <= e[0] < t1]
    kinds = {}
    for e in ev:
        kinds[e[1]] = kinds.get(e[1], 0) + 1
    print('B 鼓 第%d半: %d 击 %s' % (half_i + 1, len(ev), dict(sorted(kinds.items()))))

print()
# 主旋律音域（C3/D1/D2）
for sec in ('C1', 'C2', 'C3', 'D1', 'D2', 'outro'):
    a, b = SEC[sec]
    ps = [n[1] for n in tr['lead']['notes'] if a <= n[0] < b]
    hi = [p for p in ps if p >= 96]
    print('%-6s lead %3d 音 中位 %s  最高 %s  >=96 的音 %d 个  中位(前半) %s' % (
        sec, len(ps), int(np.median(ps)) if ps else '-', max(ps) if ps else '-', len(hi),
        int(np.median(ps[:len(ps)//2])) if ps else '-'))
print()
# tick 时长
tick = tr['tick']['notes']
print('tick 音数 %d，时长 min/med/max = %.3f/%.3f/%.3f' % (len(tick), min(n[2] for n in tick), float(np.median([n[2] for n in tick])), max(n[2] for n in tick)))
print('coda 鼓事件:', [(round(e[0], 2), e[1]) for e in S['drums'] if e[0] >= SEC['coda'][0]])
print('coda 各轨音数:', {k: len([n for n in v['notes'] if n[0] >= SEC['coda'][0]]) for k, v in tr.items()})
