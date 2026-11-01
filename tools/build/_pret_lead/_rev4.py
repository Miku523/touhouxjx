# -*- coding: utf-8 -*-
import os, json, io
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
for n in ('pre1','pre2','pre3','pre4','pre6'):
    song = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    lead = sorted([z for t in song['tracks'] if t['name'] == 'lead' for z in t['notes']], key=lambda z: z[0])
    dur = song['duration']
    cov = np.zeros(int(dur * 100) + 2)
    for z in lead:
        a, b = int(z[0] * 100), int((z[0] + z[2]) * 100)
        cov[a:b + 1] = 1
    durs = [z[2] for z in lead]
    print('%-5s lead notes %4d  coverage %5.1f%%  avg dur %.2fs  median %.2fs  span %.1f-%.1f' % (
        n, len(lead), 100 * cov.mean(), float(np.mean(durs)), float(np.median(durs)), lead[0][0], lead[-1][0] + lead[-1][2]))
