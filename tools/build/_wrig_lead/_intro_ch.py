# -*- coding: utf-8 -*-
import json, os, collections
HERE=os.path.dirname(os.path.abspath(__file__))
d=json.load(open(os.path.join(HERE,'midi_flat.json'),encoding='utf-8'))
for ch in (2,4,5):
    print('== ch',ch)
    cur=None; line=[]
    for n in d['notes']:
        if n['ch']!=ch: continue
        if not (3<=n['bar']<=9): continue
        key=(n['bar'],round(n['beat'],2))
        line.append((key,n['m'],round(n['d'],2),n['v']))
    # print first 40
    for x in line[:40]: print(x)
    print('count',len(line))
