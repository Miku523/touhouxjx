# -*- coding: utf-8 -*-
import sys, os
R = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(R, 'tools'))
import midi2js as M
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
ch, segs, div = M.extract_channels(M.parse_midi(MID))
t0 = 1.548
notes = sorted((n for n in ch[0]['notes'] if n['t'] >= t0), key=lambda n: n['t'])
print('ch0 音符数 %d  音域 %d-%d' % (len(notes), min(n['m'] for n in notes), max(n['m'] for n in notes)))
# 每 8 秒的音数与最大空隙
import collections
buck = collections.defaultdict(list)
for n in notes:
    bucket = int((n['t'] - t0) // 8)
    buck[bucket].append(n['t'])
for b in range(0, 14):
    ts = buck.get(b, [])
    if not ts:
        print('%2d-%2ds  —— 无旋律' % (b*8, b*8+8)); continue
    gaps = [ts[i+1]-ts[i] for i in range(len(ts)-1)] or [0]
    print('%2d-%2ds  %3d 音  最大空隙 %.2fs' % (b*8, b*8+8, len(ts), max(gaps)))
