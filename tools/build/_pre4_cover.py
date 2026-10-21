# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\fall_pre4.js','FALL_PRE4','pre4')
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
lead = sorted((nd(n) for n in s['tracks'][0]['notes']), key=lambda n: n['t'])
dur = s['duration']
print('时长 %.2fs，lead %d 音' % (dur, len(lead)))
for a in range(0, int(dur), 4):
    seg = [n for n in lead if a <= n['t'] < a+4]
    print('  %2d-%2ds  lead %2d 音  %s' % (a, a+4, len(seg), ' '.join(str(n['m']) for n in seg[:12])))
