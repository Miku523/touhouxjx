# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import preview_song as PS
s = PS.load_song(os.path.join(ROOT,'src','engine','songs','fall_pre4.js'),'FALL_PRE4','pre4')
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
lead = sorted((nd(n) for n in s['tracks'][0]['notes']), key=lambda n: n['t'])
print('lead 52.0–58.9:', ' '.join('%s:%d' % (round(n['t'],2), n['m']) for n in lead if 52 <= n['t'] < 58.9))
print('lead 0.0–6.5  :', ' '.join('%s:%d' % (round(n['t'],2), n['m']) for n in lead if n['t'] < 6.5))
d = [x for x in s['drums'] if x[0] >= 52.0]
print('鼓 52s 起:', [ (round(x[0],2), x[1]) for x in d if x[0] < 54.5 ][:14])
print('末小节鼓:', [ (round(x[0],2), x[1]) for x in s['drums'] if x[0] >= 58.0 ])
