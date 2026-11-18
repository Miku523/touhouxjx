# -*- coding: utf-8 -*-
import os, json, numpy as np, soundfile as sf
D='tools/build/_yuk_kit/stems_v11'
out={}
for fn in sorted(os.listdir(D)):
    if not fn.endswith('.wav'): continue
    x,sr=sf.read(os.path.join(D,fn),always_2d=True)
    x=x.mean(axis=1)
    if x.size: out[fn]=round(20*np.log10(np.sqrt(np.mean(x**2))+1e-12),2)
# mono mix sections
x,sr=sf.read('tools/build/_yuk_kit/yukari_ph2_mono_v11.wav')
BAR=4*60/172.0
secs=[('intro',1,6),('A',7,22),('B',23,38),('A2',39,54),('C',55,70),('C2',71,86),('D',87,102),('D2',103,118),('END',119,121),('coda',122,123)]
sm={}
for n,b0,b1 in secs:
    a=int((b0-1)*BAR*sr); b=min(int(b1*BAR*sr),len(x))
    sm[n]=round(20*np.log10(np.sqrt(np.mean(x[a:b]**2))+1e-12),2)
# drop window check
a=int((102-1)*BAR*sr); b=int(102*BAR*sr)
sm['drop_102']=round(20*np.log10(np.sqrt(np.mean(x[a:b]**2))+1e-12),2)
print(json.dumps({'tracks':out,'sections':sm},ensure_ascii=False))