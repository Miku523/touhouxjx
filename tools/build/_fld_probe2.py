# -*- coding: utf-8 -*-
import sys, os, glob, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
base = M.SRC_BASE; up = os.path.dirname(base)
p1 = os.path.join(base, '6 - The Embodiment of Scarlet Devil', '15. U.N. Owen was her (ZUN).mid')
p2 = glob.glob(os.path.join(up, '6 - Arranges', '*Last Brutal Sister*'))[0]
for p in (p1, p2):
    d = M.parse_midi(p)
    print('==', os.path.basename(p), 'tracks', len(d['tracks']))
    for ti, t in enumerate(d['tracks'][:4]):
        kinds = collections.Counter(ev[1] for ev in t['events'])
        print(' track', ti, 'name', repr(t.get('name')), 'first', t['events'][:3], 'kinds', dict(list(kinds.items())[:12]))
