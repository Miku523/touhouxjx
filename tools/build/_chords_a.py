# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
bar = 4*60/s['bpm']
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for b in range(12, 28):
    t0,t1=b*bar,(b+1)*bar
    bass=[nd(n)['m'] for n in s['tracks'][1]['notes'] if t0<=nd(n)['t']<t1]
    harm=[nd(n)['m'] for n in s['tracks'][6]['notes'] if t0<=nd(n)['t']<t1]
    lead=[nd(n)['m'] for n in s['tracks'][0]['notes'] if t0<=nd(n)['t']<t1]
    f=lambda xs: ' '.join(sorted({names[m%12] for m in xs})) or '-'
    print('%2d %6.2fs  bass[%s] harm[%s] lead[%s]' % (b, t0, f(bass), f(harm), f(lead)))
