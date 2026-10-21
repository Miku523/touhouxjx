# -*- coding: utf-8 -*-
import json,sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
old=json.load(open('tools/build/_old_extra.json',encoding='utf-8'))
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
SRC_BAR=60.0/155*4
chans={ch:np.array([(t,m) for t,m,du,v in mid['channels'][ch]['notes']],dtype=float) for ch in ('6','2','9','1','3','4','5','8','13')}
for ti,t in enumerate(old['tracks']):
    gs=np.array([(tt,m) for tt,m,du,v in t['notes']],dtype=float)
    res=[]
    for ch,arr in chans.items():
        for shift in [k*SRC_BAR/2 for k in range(0,24)]:
            d=np.abs(arr[None,:,0]-(gs[:,None,0]+shift))
            same=np.abs(arr[None,:,1]-gs[:,None,1])<0.5
            hit=((d<0.09)&same).any(axis=1).mean()
            res.append((hit,ch,round(shift,3)))
    res.sort(reverse=True)
    print('trk%d %-9s %4d -> %s'%(ti,t['wave'],len(gs),res[:2]))
