# -*- coding: utf-8 -*-
import io, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for n in ('pre1','pre2','pre3','pre4','pre6'):
    p = os.path.join(ROOT,'tools','build','_pret_lead','%s_song.json'%n)
    d = json.load(io.open(p, encoding='utf-8'))
    tr = d['tracks']
    tot = sum(len(t['notes']) for t in tr)
    dr = sum(len(t.get('drums',[])) for t in tr) if any('drums' in t for t in tr) else d.get('drums')
    kinds = {}
    dsum = 0
    for t in tr:
        for e in t.get('drums',[]):
            kinds[e[1]] = kinds.get(e[1],0)+1
            dsum += 1
    by = {t['name']: len(t['notes']) for t in tr}
    print(n, 'dur', d['duration'], 'tracks', len(tr), 'notes', tot, 'drums', dsum, 'kinds', dict(sorted(kinds.items())))
    print('   sub', by.get('sub'), 'brass', by.get('brass'), 'strings', by.get('strings'), 'bell', by.get('bell'), 'tick', by.get('tick'), 'ride?')
