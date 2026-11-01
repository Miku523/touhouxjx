# -*- coding: utf-8 -*-
import json, io, os
B='tools/build/_pret_lead'
for n in ('pre1','pre2','pre3','pre4','pre6'):
    p=os.path.join(B, n+'_secs.json')
    print(n, io.open(p,encoding='utf-8').read())