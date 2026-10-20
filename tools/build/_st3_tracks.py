# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
def norm(n): return n if isinstance(n, dict) else dict(t=n[0], m=n[1], d=n[2], v=n[3])
print('stage3 duration %.3f bpm %s' % (s['duration'], s['bpm']))
bar = 4*60/s['bpm']
for i,t in enumerate(s['tracks']):
    ns=[norm(n) for n in t['notes']]; ps=[n['m'] for n in ns]
    print('轨%d %-9s gain %.3f 音数 %-4d 音域 %d-%d 中位 %d' % (i, t['wave'], t['gain'], len(ns), min(ps), max(ps), sorted(ps)[len(ps)//2]))
# 各轨前 8 小节头 12 个音的 (拍位, 音高)
for i,t in enumerate(s['tracks']):
    ns=sorted([norm(n) for n in t['notes']], key=lambda n:n['t'])[:12]
    print('轨%d 头 12 音:' % i, [(round(n['t'],2), n['m']) for n in ns])
