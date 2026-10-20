# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import preview_song as PS
s = PS.load_song(os.path.join(ROOT,'src','engine','songs','title_chronicle.js'), 'TITLE_CHRONICLE', 'title')
def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0], m=r[1], d=r[2], v=r[3]) for r in rows]
tracks = [objs(tr['notes']) for tr in s['tracks']]
bar = 4*60.0/s['bpm']
nb = int(s['duration']/bar)
print('title %s | %.2fs | %d bpm | bar %.3fs | %d bars' % (s['title'], s['duration'], s['bpm'], bar, nb))
for i, ns in enumerate(tracks):
    print(' track%d %s gain=%.3f notes=%d t=[%.2f,%.2f] mid=[%d,%d] polyMax=%d'
          % (i, s['tracks'][i]['wave'], s['tracks'][i]['gain'], len(ns),
             min(n['t'] for n in ns), max(n['t'] for n in ns),
             min(n['m'] for n in ns), max(n['m'] for n in ns),
             max(len([n for n in ns if abs(n['t']-t0) < 1e-6]) for t0 in sorted(set(n['t'] for n in ns))[:400])))
print('--- bar | t0..t5 notes | drums(kinds) ---')
for b in range(nb):
    a, z = b*bar, (b+1)*bar
    c = [sum(1 for n in ns if a <= n['t'] < z) for ns in tracks]
    dk = collections.Counter(x[1] for x in s['drums'] if a <= x[0] < z)
    print('bar%2d %s | drums=%2d %s' % (b, ' '.join('%3d'%v for v in c), sum(dk.values()), dict(sorted(dk.items()))))
