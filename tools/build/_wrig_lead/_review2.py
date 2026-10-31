# -*- coding: utf-8 -*-
import json, wave, os
import numpy as np
HERE='tools/build/_wrig_lead'
d=json.load(open(HERE+'/song.json',encoding='utf-8'))
secs=json.load(open(HERE+'/secs.json',encoding='utf-8'))['secs']
tr={t['name']:t['notes'] for t in d['tracks']}
drums=d['drums']
def insec(t,a,b): return a<=t<b
print('== lead 空窗 >1.2s ==')
lead=sorted(n[0] for n in tr['lead'])
gaps=[(lead[i],lead[i+1],lead[i+1]-lead[i]) for i in range(len(lead)-1) if lead[i+1]-lead[i]>1.2]
for g in gaps: print('  %.2f-%.2f (%.2fs)'%g)
print('== 每段：lead 音数 / 鼓密度 / 每轨音数 ==')
for name,a,b in secs:
    ln=sum(1 for n in tr['lead'] if insec(n[0],a,b))
    dn=sum(1 for x in drums if insec(x[0],a,b))
    dur=b-a
    top=sorted(((sum(1 for n in v if insec(n[0],a,b)),k) for k,v in tr.items()),reverse=True)[:5]
    print('  %-6s %6.2f-%6.2f lead %3d  drum %4d (%.1f/s)  top: %s'%(name,a,b,ln,dn,dn/dur,' '.join('%s:%d'%(k,c) for c,k in top)))
print('== lead 段落旋律相似度（音高序列） ==')
def seq(a,b):
    return [round(n[1]) for n in tr['lead'] if insec(n[0],a,b)]
for n1,a1,b1 in secs:
    for n2,a2,b2 in secs:
        if n1>=n2: continue
        s1,s2=seq(a1,b1),seq(a2,b2)
        if not s1 or not s2: continue
        m=min(len(s1),len(s2))
        same=sum(1 for i in range(m) if s1[i]==s2[i])/m
        if same>0.85 and len(s1)>40: print('  %s vs %s: %.0f%% (%d/%d 音)'%(n1,n2,same*100,m,len(s1)))