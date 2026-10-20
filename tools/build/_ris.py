# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
bar = 4*60/s['bpm']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
ris = [nd(n) for n in s['tracks'][4]['notes']]
print('riser/pad 轨 %d 音' % len(ris))
for n in ris[:40]:
    print('  t=%.3f bar=%.2f m=%d d=%.2f v=%d' % (n['t'], n['t']/bar, n['m'], n['d'], n['v']))
