# -*- coding: utf-8 -*-
import json, io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for n, t0, t1 in (('pre2', 6.5, 8.4), ('pre3', 4.0, 6.2)):
    d = json.load(io.open(os.path.join(ROOT, 'tools/build/_pret_lead/%s_song.json' % n), encoding='utf-8'))
    print('==', n, 'tracks', len(d['tracks']), 'drums', len(d['drums']))
    for tr in d['tracks']:
        ns = [x for x in tr['notes'] if t0 <= x[0] < t1]
        if ns:
            print('  ', tr['name'], len(ns), ns[:3])
    dr = [x for x in d['drums'] if t0 <= x[0] < t1]
    print('   drums', len(dr), dr[:4])
