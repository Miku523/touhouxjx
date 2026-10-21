# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\fall_pre4.js','FALL_PRE4','pre4')
lead = s['tracks'][0]['notes']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
ns = sorted((nd(n) for n in lead), key=lambda n: n['t'])
print('lead 总 %d 音；16–42s：' % len(ns))
seg = [n for n in ns if 16 <= n['t'] < 42]
print('  音数', len(seg), '前 40:', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in seg[:40]])
