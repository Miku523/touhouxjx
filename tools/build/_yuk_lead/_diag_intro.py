# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json
x,sr=sf.read('tools/build/_yuk_kit/yukari_ph2_stereo.wav',always_2d=True); m=x.mean(axis=1)
BAR=4*60/172.0; B=BAR/4
def r(t0,t1):
    a=int(t0*sr); b=min(int(t1*sr),len(m))
    return round(20*np.log10(np.sqrt(np.mean(m[a:b]**2))+1e-12),2) if b>a else None
res={}
for bar in range(1,7):
    res['intro%d'%bar]=r((bar-1)*BAR, bar*BAR)
for bar in range(5,7):
    res['intro_b%d'%bar]=r((bar-1)*BAR+BAR*0.5, bar*BAR)
for bar in (101,102):
    for i in range(4):
        res['b%d_%d'%(bar,i)]=r((bar-1)*BAR+i*B,(bar-1)*BAR+(i+1)*B)
res['b103_0']=r((103-1)*BAR,(103-1)*BAR+B)
for bar in (119,120,121,122,123):
    res['b%d'%bar]=r((bar-1)*BAR, bar*BAR)
print(json.dumps(res))