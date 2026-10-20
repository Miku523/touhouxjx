# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
def n_(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
bar = 4*60/s['bpm']
print('窗口 28.6–38.15s（第 18–24 小节）各轨音数：')
for i,t in enumerate(s['tracks']):
    ns=[n_(n) for n in t['notes'] if 18*bar <= n_(n)['t'] < 24*bar]
    if ns:
        print('  轨%d %-9s gain %.3f  音数 %-4d 音域 %d-%d' % (i,t['wave'],t['gain'],len(ns),min(n['m'] for n in ns),max(n['m'] for n in ns)))
    else:
        print('  轨%d %-9s gain %.3f  空' % (i,t['wave'],t['gain']))
d=[x for x in s['drums'] if 18*bar <= x[0] < 24*bar]
print('鼓 %d 击（%.1f 击/秒）' % (len(d), len(d)/(6*bar)))
print('各段总击数: 全曲 %d' % len(s['drums']))
