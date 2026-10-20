# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\yuuhei_pre3.js', 'YUUHEI_PRE3', 'pre3')
bar = 4*60/s['bpm']
def tmvd(n): return (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
print('%s / %.2fs / %d 轨 / %d 鼓 / bpm %d' % (s['title'], s['duration'], len(s['tracks']), len(s.get('drums',[])), s['bpm']))
lead = s['tracks'][0]['notes']
print('主旋律每 4 小节音符数:', [len([n for n in lead if b*bar <= tmvd(n)[0] < (b+4)*bar]) for b in range(0,40,4)])
ms=[tmvd(n)[1] for n in lead]
print('主旋律音域 %d-%d' % (min(ms), max(ms)))
ts=sorted(tmvd(n)[0] for n in lead)
print('最长静默 %.2fs' % max(ts[i+1]-ts[i] for i in range(len(ts)-1)))
