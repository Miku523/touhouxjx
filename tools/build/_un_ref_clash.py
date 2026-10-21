# -*- coding: utf-8 -*-
import json,sys
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
d=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
ev=[]
def addlayer(ch,ti):
    for t,m,du,v in d['channels'][ch]['notes']:
        ev.append((t,t+du,m,ti))
for i,ch in enumerate(('6','2','9','1','3','4')): addlayer(ch,i)
ev.sort()
clash=tot=0
for i,(t0,t1,m,ti) in enumerate(ev):
    for t0b,t1b,m2,tj in ev[i+1:]:
        if t0b>=t1-1e-6: break
        if ti==tj: continue
        tot+=1
        if abs(m-m2)%12 in (1,11): clash+=1
print('ZUN 原曲各层同时发声配对 %d，半音撞车 %d（%.1f%%）'%(tot,clash,100.0*clash/max(1,tot)))
# 音级分布
pc=Counter()
for ch in ('6','2','9','1','3','4'):
    for t,m,du,v in d['channels'][ch]['notes']: pc[m%12]+=du
tot2=sum(pc.values())
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print('原曲音级加权：'+' '.join('%s%.3f'%(nn[k],pc[k]/tot2) for k in sorted(pc,key=lambda x:-pc[x])[:7]))
