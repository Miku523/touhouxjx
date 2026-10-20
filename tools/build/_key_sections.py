# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js','ATEAM_STAGE3','stage3')
def nd(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
bar = 4*60/s['bpm']
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def chroma(t0, t1, idx, weight_dur=False):
    c = [0.0]*12
    for n in s['tracks'][idx]['notes']:
        o = nd(n)
        if t0 <= o['t'] < t1:
            c[o['m'] % 12] += (o['d'] if weight_dur else 1.0)
    tot = sum(c) or 1
    return [round(v/tot*100) for v in c]
sections = [('A 0–23.8s', 0, 23.8), ('过渡 28.6–38.1s', 28.6, 38.15),
            ('B 38.2–63.6s', 38.15, 63.58), ('C 63.6–89s', 63.58, 89.01), ('尾声 89–101.7s', 89.01, 101.7)]
print('音级分布 (%%)  ' + ' '.join('%-3s' % n for n in names))
for name, a, b in sections:
    print('lead  %-16s' % name, ' '.join('%3d' % v for v in chroma(a,b,0)))
print()
for name, a, b in sections:
    print('bass  %-16s' % name, ' '.join('%3d' % v for v in chroma(a,b,1)))
print()
for name, a, b in sections:
    print('harm  %-16s' % name, ' '.join('%3d' % v for v in chroma(a,b,6)))
