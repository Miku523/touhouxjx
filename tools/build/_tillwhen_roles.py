# -*- coding: utf-8 -*-
import sys, os, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
mf = M.parse_midi(f)
chans, segs, div = M.extract_channels(mf)
bar = 4 * 60.0 / 155.0
print('bar = %.4fs  （155 BPM）' % bar)
def stats(i):
    ns = chans[i]['notes']
    if not ns: return
    d = sum(n['d'] for n in ns) / len(ns)
    mono = collections.Counter(round(n['t'], 2) for n in ns)
    poly = sum(1 for k, v in mono.items() if v > 1) / max(1, len(mono))
    print('  ch%-2d %4d 音  平均时值 %.3f  同刻复音率 %.2f  音域 %d-%d' % (i, len(ns), d, poly,
          min(n['m'] for n in ns), max(n['m'] for n in ns)))
for i in sorted(chans):
    stats(i)
print()
print('每 4 小节各通道音数（小节号: ch0 ch3 ch4 ch5 ch6 ch8）:')
cols = [0, 3, 4, 5, 6, 8]
grid = {c: collections.Counter() for c in cols}
for c in cols:
    for n in chans[c]['notes']:
        grid[c][int(n['t'] // (bar * 4))] += 1
for b in range(0, 18):
    print('  %2d: %s' % (b, '  '.join('%3d' % grid[c][b] for c in cols)))
print()
for c in (0, 3, 5, 6):
    ns = sorted(chans[c]['notes'], key=lambda n: n['t'])[:14]
    print('ch%d 开头: %s' % (c, [(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns]))
