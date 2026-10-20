# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js', 'ATEAM_STAGE3', 'stage3')
bar = 4*60/s['bpm']
lead = s['tracks'][0]['notes']
def tmvd(n): return (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
print('主旋律每 4 小节音符数:')
print([len([n for n in lead if b*bar <= tmvd(n)[0] < (b+4)*bar]) for b in range(0,64,4)])
ms=[tmvd(n)[1] for n in lead]
print('主旋律音域 %d-%d' % (min(ms), max(ms)))
A=[tmvd(n)[1] for n in lead if tmvd(n)[0] < 32*bar]
B=[tmvd(n)[1] for n in lead if 32*bar <= tmvd(n)[0] < 56*bar]
O=[tmvd(n)[1] for n in lead if tmvd(n)[0] >= 56*bar]
print('A 段音域 %d-%d / B 段 %d-%d / 尾声 %d-%d' % (min(A),max(A),min(B),max(B),min(O),max(O)))
print('主旋律最长静默:')
ts=sorted(tmvd(n)[0] for n in lead); gaps=[(round(ts[i+1]-ts[i],2), round(ts[i],2)) for i in range(len(ts)-1)]
print(max(gaps))
