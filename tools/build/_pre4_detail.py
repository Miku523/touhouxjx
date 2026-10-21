# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\fall_pre4.js','FALL_PRE4','pre4')
bar = 4*60/s['bpm']; beat = 60/s['bpm']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
t = s['tracks'][0]['notes']
ts = sorted(nd(n)['t'] for n in t)
gaps = [round(b-a,2) for a,b in zip(ts, ts[1:])]
print('lead %d 音, 首 %.2fs 末 %.2fs, 最大空档 %.2fs' % (len(t), ts[0], ts[-1], max(gaps)))
print('最大 5 个空档:', sorted(gaps, reverse=True)[:5])
print('每小节 lead 音数:', [sum(1 for n in ts if b*bar <= n < (b+1)*bar) for b in range(40)])
print('音域:', min(nd(n)['m'] for n in t), max(nd(n)['m'] for n in t))
print('前 15 音:', [(round(nd(n)['t'],2), nd(n)['m']) for n in sorted(t, key=lambda x: nd(x)['t'])[:15]])
