# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js', 'ATEAM_STAGE3', 'stage3')
bar = 4*60/s['bpm']
def tmvd(n): return (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
lead = s['tracks'][0]['notes']
print('%s / %.2fs' % (s['title'], s['duration']))
print('每 8 小节主旋律音数:', [len([n for n in lead if b*bar <= tmvd(n)[0] < (b+8)*bar]) for b in range(0,64,8)])
seg = lambda a,b: [tmvd(n) for n in lead if a*bar <= tmvd(n)[0] < b*bar]
names = [('A TH06', 0, 24), ('B TH09', 24, 40), ('C PMC', 40, 56), ('尾声', 56, 64)]
EMIN = {4,6,7,9,11,0,2}
for nm,a,b in names:
    ns = seg(a,b)
    if not ns: print(nm, '空'); continue
    ms=[x[1] for x in ns]
    fit = sum(x[2] for x in ns if x[1]%12 in EMIN)/sum(x[2] for x in ns)
    print('%s: %d 音 音域 %d-%d 中位 %d，E 小调吻合 %.2f' % (nm, len(ns), min(ms), max(ms), sorted(ms)[len(ms)//2], fit))
