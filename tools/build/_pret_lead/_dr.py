# -*- coding: utf-8 -*-
import json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
d = json.load(open(os.path.join(HERE, name + '_flat.json'), encoding='utf-8'))
notes = d['notes']
segs = [int(x) for x in sys.argv[2].split(',')]
for ch in sorted(set(n['ch'] for n in notes)):
    ns = [n for n in notes if n['ch'] == ch and segs[0] <= n['bar'] <= segs[1]]
    if not ns: continue
    c = collections.Counter(x['m'] for x in ns)
    if ch == 9:
        print('ch9 keys', dict(sorted(c.items())))
    else:
        dur = collections.Counter(round(x['d'], 2) for x in ns)
        print('ch%-3d n=%-4d pcs=%s dur=%s' % (ch, len(ns), dict(sorted(collections.Counter(x['m'] % 12 for x in ns).items())), dict(sorted(dur.items())[:6])))
