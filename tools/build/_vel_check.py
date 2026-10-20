# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js', 'ATEAM_STAGE3', 'stage3')
bar = 4*60/s['bpm']
def tmvd(n): return (n['t'],n['m'],n['d'],n['v']) if isinstance(n,dict) else (n[0],n[1],n[2],n[3])
for ti, tr in enumerate(s['tracks']):
    ns = tr['notes']
    for nm,a,b in (('bars0-16',0,16),('bars16-18',16,18),('bars18-24',18,24),('bars24-40 B',24,40)):
        sel=[tmvd(n) for n in ns if a*bar <= tmvd(n)[0] < b*bar]
        if not sel: 
            print('t%d %-10s 空' % (ti,nm)); continue
        vs=[x[3] for x in sel]; ms=[x[1] for x in sel]
        print('t%d %-10s 音数 %-4d 平均力度 %.0f 平均音高 %.0f' % (ti, nm, len(sel), sum(vs)/len(vs), sum(ms)/len(ms)))
    if ti >= 3: break
