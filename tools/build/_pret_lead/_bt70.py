# -*- coding: utf-8 -*-
import io, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from _pret_lib import load_flat, Song
for n in ('pre1','pre2','pre3','pre4','pre6'):
    d = load_flat(n, {'pre1':145.0,'pre2':151.0,'pre3':143.0,'pre4':163.0,'pre6':162.0}[n])
    s = Song(n, n, n, n, d['bpm'], max(1, d['last_bar']))
    s.set_meters(d['meters'])
    print(n, 'nbars', s.nbars, 'dur', round(s.dur,3))
    for bar in ([27,43,83] if n=='pre6' else [3,17,33,41,55,71,83,100]):
        if bar <= s.nbars:
            print('   bar', bar, round(s.bt(bar),3))
