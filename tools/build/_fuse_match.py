# -*- coding: utf-8 -*-
import json,sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
old=json.load(open('tools/build/_old_extra.json',encoding='utf-8'))
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
SRC_BAR=60.0/155*4
chans={ch:[(t,m) for t,m,du,v in mid['channels'][ch]['notes']] for ch in ('6','2','9','1','3','4','5','8','13','10')}
for ch in chans: print('ch%s %d'%(ch,len(chans[ch])),end='  ')
print()
best={}
for ti,t in enumerate(old['tracks']):
    gs=[(tt,m) for tt,m,du,v in t['notes']]
    res=[]
    for ch,ms in chans.items():
        for shift in [k*SRC_BAR for k in range(0,8)]+[k*SRC_BAR/2 for k in range(0,16)]:
            hit=0
            arr=np.array([ (tt, m) for tt,m in ms], dtype=float)
            for (tt,m) in gs:
                d=np.abs(arr[:,0]-(tt+shift))
                ok=((d<0.03)&(arr[:,1]==m)).any()
                if ok: hit+=1
            res.append((hit/max(1,len(gs)),ch,round(shift,3)))
    res.sort(reverse=True)
    print('trk%d %-9s %4d 音 → 最佳匹配 %s'%(ti,t['wave'],len(gs),res[:3]))
