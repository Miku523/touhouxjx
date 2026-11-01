# -*- coding: utf-8 -*-
import os, json, io
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
for n in ('pre1','pre2','pre3','pre4','pre6'):
    song = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    sec = json.load(io.open(os.path.join(LEAD, n + '_secs.json'), encoding='utf-8'))['secs']
    print('==', n, 'segs:', [(t, round(b-a,2)) for t, a, b in sec])
    for tr in song['tracks']:
        ns = tr['notes']
        if not ns:
            continue
        print('   %-8s %5d  %6.2f - %6.2f' % (tr['name'], len(ns), ns[0][0], max(z[0]+z[2] for z in ns)))
    lead = sorted([z for tr in song['tracks'] if tr['name']=='lead' for z in tr['notes']], key=lambda z: z[0])
    print('   lead first 6:', [(round(z[0],2), z[1]) for z in lead[:6]])
