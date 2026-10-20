# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
bar = 4*60/s['bpm']
def tmvd(n): return (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
for ti in (0,1,2,3):
    ns=s['tracks'][ti]['notes']
    print('源 track%d 每 2 小节音数:' % ti, [len([n for n in ns if b*bar <= tmvd(n)[0] < (b+2)*bar]) for b in range(0,52,2)])
