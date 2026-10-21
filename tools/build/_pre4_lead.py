# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\fall_pre4.js','FALL_PRE4','pre4')
bar = 4*60/s['bpm']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
t = [nd(n) for n in s['tracks'][0]['notes']]
t.sort(key=lambda x:x['t'])
print('lead %d 音 / 首 %.2fs / 末 %.2fs / 音域 %d-%d' % (len(t), t[0]['t'], t[-1]['t'], min(n['m'] for n in t), max(n['m'] for n in t)))
print('前 12 音:', [(round(n['t'],2), n['m']) for n in t[:12]])
print('每小节音数:', [sum(1 for n in t if b*bar <= n['t'] < (b+1)*bar) for b in range(44)])
gaps = [round(b['t']-a['t'],2) for a,b in zip(t,t[1:])]
print('最大空档 %.2fs' % max(gaps), sorted(gaps, reverse=True)[:3])
