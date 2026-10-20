# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
bar = 4*60/s['bpm']
t0, t1 = 37.0, 39.6
print('37.0–39.6s 事件（相对 38.15s）:')
names = ['lead','bass','saw','sub','riser','counter','harm']
for i,tr in enumerate(s['tracks']):
    ev = sorted([nd(n) for n in tr['notes'] if t0 <= nd(n)['t'] < t1], key=lambda n:n['t'])
    print('%-8s' % names[i], ' '.join('%.2f:%d/%d' % (n['t']-t0-1.15, n['m'], n['v']) for n in ev))
d = sorted([x for x in s['drums'] if t0 <= x[0] < t1])
print('drums   ', ' '.join('%.2f:k%d/%d' % (x[0]-t0-1.15, x[1], x[2]) for x in d))
