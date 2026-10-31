# -*- coding: utf-8 -*-
import json, os
HERE='tools/build/_wrig_lead'
d=json.load(open(HERE+'/song.json',encoding='utf-8'))
secs=json.load(open(HERE+'/secs.json',encoding='utf-8'))['secs']
tr={t['name']:t['notes'] for t in d['tracks']}
lead=sorted(n[0] for n in tr['lead'])
gaps=[(round(lead[i],2),round(lead[i+1],2),round(lead[i+1]-lead[i],2)) for i in range(len(lead)-1) if lead[i+1]-lead[i]>1.2]
print('lead gaps',gaps)
def insec(t,a,b): return a<=t<b
def seq(a,b): return [n[1] for n in tr['lead'] if insec(n[0],a,b)]
def name(a,b):
    for nm,x,y in secs:
        if abs(x-a)<0.01 and abs(y-b)<0.01: return nm
    return '?'
for n1,x1,y1 in secs:
    for n2,x2,y2 in secs:
        if n1>=n2: continue
        s1,s2=seq(x1,y1),seq(x2,y2)
        if not s1 or not s2: continue
        m=min(len(s1),len(s2)); same=sum(1 for i in range(m) if s1[i]==s2[i])/m
        up=sum(1 for i in range(m) if s1[i]-s2[i]==12)/m
        if same>0.8 or up>0.8: print('  %s vs %s: same %.0f%% / up12 %.0f%% (%d)'%(n1,n2,same*100,up*100,m))
# rep2 last4 transpose check
a=[n for n in tr['lead'] if insec(n[0],78.97,91.36)]
print('rep2 lead first/last', a[0], a[-1])
# note counts per track
print('tracks', {t['name']:len(t['notes']) for t in d['tracks']})
print('dur', d['duration'], 'drums', len(d['drums']))