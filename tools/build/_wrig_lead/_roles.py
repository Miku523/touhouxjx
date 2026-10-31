# -*- coding: utf-8 -*-
import json, collections, os
ROOT=r'C:\Users\GuSheng\Downloads\HKS'
d=json.load(open(os.path.join(ROOT,'tools','build','_wrig_lead','midi_flat.json'),encoding='utf-8'))
notes=d['notes']; by=collections.defaultdict(list)
for n in notes: by[n['ch']].append(n)
secs=[('intro',2,9),('A',10,26),('B',27,42),('out',43,50)]
print('notes per section')
print('ch ', ' '.join('%7s'%s[0] for s in secs))
for ch in sorted(by):
    row=[]
    for name,a,b in secs:
        row.append('%7d'%sum(1 for n in by[ch] if a<=n['bar']<=b))
    print('%2d '%ch, ' '.join(row))
for ch in (0,2,5,6,7,8,3,4,10,11,14):
    ns=by[ch]
    if not ns: continue
    print('ch%2d med %d range %d-%d'%(ch, sorted(n['m'] for n in ns)[len(ns)//2], min(n['m'] for n in ns), max(n['m'] for n in ns)))
