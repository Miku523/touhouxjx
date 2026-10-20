# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
def tmvd(n): return (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
base = r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs'
for f,ex,k in (('ateam_stage3.js','ATEAM_STAGE3','stage3'), ('yuuhei_pre3.js','YUUHEI_PRE3','pre3')):
    s = PS.load_song(os.path.join(base, f), ex, k)
    bar = 4*60/s['bpm']
    lead = s['tracks'][0]['notes']
    ts = sorted(tmvd(n)[0] for n in lead)
    gaps = sorted(((round(ts[i+1]-ts[i],2), round(ts[i],2)) for i in range(len(ts)-1)), reverse=True)[:5]
    print('== %s %s %.2fs bpm %d' % (f, s['title'], s['duration'], s['bpm']))
    print('  主旋律最大空档 (秒, 起点):', gaps)
    print('  每小节主旋律音数:', [len([n for n in lead if b*bar <= tmvd(n)[0] < (b+1)*bar]) for b in range(0, min(40, int(s['duration']/bar)+1))])
