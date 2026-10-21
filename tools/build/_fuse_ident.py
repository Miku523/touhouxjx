# -*- coding: utf-8 -*-
import json,sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
old=json.load(open('tools/build/_old_extra.json',encoding='utf-8'))
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
B=60.0/155*4
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print('旧版 EX 曲轨道：')
for i,t in enumerate(old['tracks']):
    ns=t['notes']; m=[n[1] for n in ns]; d=[n[2] for n in ns]
    print('  trk%d %-9s gain=%.3f %4d 音 音域%d-%d 中位%d 均时值%.3f 末音%.2fs'%(i,t['wave'],t['gain'],len(ns),min(m),max(m),int(np.median(m)),np.mean(d),ns[-1][0]))
print('\nMIDI 通道：')
for ch in ('6','2','9','1','3','4','5','8','13'):
    ns=mid['channels'][ch]['notes']; m=[n[1] for n in ns]
    print('  ch%-3s %4d 音 音域%d-%d 中位%d'%(ch,len(ns),min(m),max(m),int(np.median(m))))
# 鼓密度
dr=old['drums']
print('\n鼓：%d 击 / %.1f 击每秒'%(len(dr),len(dr)/old['duration']))
kinds={}
for t,k,v in dr: kinds[k]=kinds.get(k,0)+1
print('  种类', kinds)
print('\n每 4 小节鼓数 / 音数：')
for b0 in range(0,80,4):
    t0,t1=b0*B,(b0+4)*B
    dc=len([d for d in dr if t0<=d[0]<t1])
    nc=sum(len([n for n in t['notes'] if t0<=n[0]<t1]) for t in old['tracks'])
    print('  bar%2d-%2d (%5.1f-%5.1fs) 鼓%3d 音%4d'%(b0+1,b0+4,t0,t1,dc,nc))
