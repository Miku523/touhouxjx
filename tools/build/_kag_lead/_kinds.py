# -*- coding: utf-8 -*-
import json, io, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(io.open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
SEC = [(n, a, b) for n, a, b in json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']]
for n, a, b in SEC:
    d = [e for e in S['drums'] if a <= e[0] < b]
    c = collections.Counter(e[1] for e in d)
    dur = b - a
    print('%-6s %5d hits %5.2f/s  ' % (n, len(d), len(d) / dur) + ' '.join('k%d=%d' % (k, c[k]) for k in sorted(c)))
