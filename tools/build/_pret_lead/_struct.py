# -*- coding: utf-8 -*-
import json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
d = json.load(open(os.path.join(HERE, name + '_flat.json'), encoding='utf-8'))
notes = d['notes']
nbar = max(n['bar'] for n in notes)
chs = sorted(set(n['ch'] for n in notes))
cnt = {ch: collections.Counter() for ch in chs}
for n in notes:
    cnt[n['ch']][n['bar']] += 1
print('name', name, 'bpm', d['bpm'], 'bars', nbar)
print('bar  ' + ' '.join('c%-4d' % c for c in chs))
for b0 in range(1, nbar + 1, 4):
    row = []
    for c in chs:
        s = sum(cnt[c].get(b, 0) for b in range(b0, b0 + 4))
        row.append('%-5d' % s)
    print('%3d  %s' % (b0, ' '.join(row)))
