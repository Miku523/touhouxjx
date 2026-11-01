# -*- coding: utf-8 -*-
import json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
d = json.load(open(os.path.join(HERE, name + '_flat.json'), encoding='utf-8'))
notes = d['notes']
print('bpm', d['bpm'], 'bars', max(n['bar'] for n in notes), 'n', len(notes))
by = collections.defaultdict(list)
for n in notes:
    by[n['bar']].append(n)
for ch in sorted(set(n['ch'] for n in notes)):
    ns = [n for n in notes if n['ch'] == ch]
    print('ch%-2d n=%-4d %d-%d med%d' % (ch, len(ns), min(x['m'] for x in ns), max(x['m'] for x in ns), sorted(x['m'] for x in ns)[len(ns)//2]))
lo, hi = int(sys.argv[2]), int(sys.argv[3])
for b in range(lo, hi + 1):
    line = []
    for ch in sorted(set(n['ch'] for n in by[b])):
        ns = sorted(by[b], key=lambda x: (x['beat'], x['m']))
        ns = [x for x in ns if x['ch'] == ch]
        if not ns: continue
        line.append('ch%d[%s]' % (ch, ' '.join('%g:%d' % (round(x['beat'], 2), x['m']) for x in ns)))
    print('bar%-3d %s' % (b, ' | '.join(line)))
