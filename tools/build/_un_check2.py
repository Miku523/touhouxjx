# -*- coding: utf-8 -*-
import json, sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
SR=44100
x,sr=sf.read('tools/build/un_preview.wav',always_2d=True); m=x.mean(axis=1)
d=json.load(open('tools/build/_un_flandre.json',encoding='utf-8'))
BAR=60.0/d['bpm']*4
tr={('%.3f'%t['gain']):t for t in d['tracks']}
lead=d['tracks'][0]['notes']; harm=d['tracks'][1]['notes']
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(v): return nn[v%12]+str(v//12-1)
print('峰值 %.3f rms %.4f'%(np.abs(m).max(),np.sqrt((m**2).mean())))
print('\nA 段（8-12 小节）主旋律：')
c=0
for n in lead:
    if 8*BAR<=n[0]<12*BAR:
        print('  %5.2fs %-4s'%(n[0],nm(n[1])),end='')
        c+=1
        if c%8==0: print()
print('\n\n每段主旋律音数/音域：')
SEC=[('intro',0,8),('A',8,19),('A2',19,30),('B',30,39),('C',39,53),('D',53,57),('E',57,65),('F',65,76),('G',76,87),('T',87,96)]
for name,a,b in SEC:
    ns=[n for n in lead if a*BAR<=n[0]<b*BAR]
    if ns:
        print('  %-5s %3d 音  %s-%s  中位 %s'%(name,len(ns),nm(min(n[1] for n in ns)),nm(max(n[1] for n in ns)),nm(int(np.median([n[1] for n in ns])))))
    else:
        print('  %-5s 无 lead'%name)
print('\n每段 rms：')
for name,a,b in SEC:
    seg=m[int(a*BAR*SR):int(b*BAR*SR)]
    print('  %-5s %.4f'%(name,np.sqrt((seg**2).mean()) if len(seg) else 0))
# 和声贴合：lead 音与同时发声的 harm/bass 的音级关系（半音撞车）
import collections
allev=[]
for ti,tt in enumerate(d['tracks']):
    for n in tt['notes']:
        allev.append((n[0],n[0]+n[2],n[1],ti))
allev.sort()
clash=0; tot=0
for i,(t0,t1,mi,ti) in enumerate(allev):
    for t0b,t1b,mj,tj in allev[i+1:]:
        if t0b>=t1-1e-6: break
        if ti==tj: continue
        tot+=1
        if abs(mi-mj)%12 in (1,11): clash+=1
print('\n跨轨重叠配对 %d，半音撞车 %d（%.1f%%）'%(tot,clash,100.0*clash/max(1,tot)))
