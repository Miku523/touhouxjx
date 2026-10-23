# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games','6 - The Embodiment of Scarlet Devil','2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs)
e16 = 60.0/bpm/4.0
dr = sorted(chans[9]['notes'], key=lambda n:n['t'])
t_start = dr[0]['t']
print('鼓 pitch 分布与 16 分网格位置（0-15）:')
for p in sorted(set(n['m'] for n in dr)):
    ns = [n for n in dr if n['m']==p]
    pos = Counter(int(round((n['t']-t_start)/e16)) % 16 for n in ns)
    print('  p%-3d n=%-4d pos=%s' % (p, len(ns), [pos.get(i,0) for i in range(16)]))
print()
print('主旋律时值分布（秒）:')
for ch,name in [(5,'trumpet A'),(3,'horn B'),(6,'piano C'),(2,'ch2'),(4,'epiano'),(10,'guitar'),(1,'bass')]:
    ns = chans[ch]['notes']
    ds = sorted(round(n['d'],2) for n in ns)
    print('  ch%-2d %-10s n=%-4d d: min %.2f med %.2f max %.2f' % (ch,name,len(ns),ds[0],ds[len(ds)//2],ds[-1]))
