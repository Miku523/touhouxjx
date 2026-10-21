# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
path = BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'
midi = M.parse_midi(path)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
print('bpm', bpm, 'bar', round(bar,4))

# 1) 每 4 小节各通道音数表
nb = 86
grid = np.zeros((nb//4+1, 16), int)
for ch, c in chans.items():
    if ch > 15: continue
    for n in c['notes']:
        b = int(n['t'] // (bar*4))
        if b < grid.shape[0]: grid[b, ch] += 1
print('bars(4) ' + ' '.join('ch%-2d' % c for c in range(16)))
for i in range(grid.shape[0]):
    print('%3d-%3d ' % (i*4, i*4+3) + ' '.join('%4d' % grid[i,c] for c in range(16)))

# 2) 八度/同音重合格局：识别加倍关系
print('\n--- 通道重合（±0.04s，Δpitch 0 或 +12）---')
chs = sorted([c for c in chans if c != 9 and chans[c]['notes']])
for a in chs:
    A = chans[a]['notes']
    row = []
    for b in chs:
        if a == b: row.append('  -  '); continue
        B = chans[b]['notes']
        idx = {}
        for n in B: idx.setdefault(round(n['t'],2), []).append(n['m'])
        hit = 0
        for n in A:
            for dt in (-0.04, 0.0, 0.04):
                for m in idx.get(round(n['t']+dt,2), []):
                    if m - n['m'] in (0, 12, -12): hit += 1; break
                else: continue
                break
        row.append('%4.2f' % (hit/len(A)))
    print('ch%-2d n%-5d ' % (a, len(A)) + ' '.join(row))
print('       ' + ' '.join('ch%-2d' % c for c in chs))
