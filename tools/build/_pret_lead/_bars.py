
import os, sys, json, collections
LEAD = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
name = sys.argv[1]
b0, b1 = int(sys.argv[2]), int(sys.argv[3])
d = json.load(open(os.path.join(LEAD, name + '_flat.json'), encoding='utf-8'))
notes = [n for n in d['notes'] if b0 <= n['bar'] <= b1]
by = collections.defaultdict(list)
for n in notes:
    by[n['ch']].append(n)
for ch in sorted(by):
    ns = sorted(by[ch], key=lambda n: (n['bar'], n['beat']))
    s = ' '.join('%d.%g:%d(%g)' % (n['bar'], n['beat'], n['m'], round(n['d'], 2)) for n in ns[:26])
    print('ch%-2d n=%-4d %s' % (ch, len(ns), s))
