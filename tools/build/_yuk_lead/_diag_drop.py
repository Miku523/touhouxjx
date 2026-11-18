# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json
x,sr=sf.read('tools/build/_yuk_kit/yukari_ph2_mono_v11.wav')
BAR=4*60/172.0; BEAT=BAR/4
def rms(t0,t1):
    a=int(t0*sr); b=min(int(t1*sr),len(x))
    return round(20*np.log10(np.sqrt(np.mean(x[a:b]**2))+1e-12),2) if b>a else None
res={}
base=(102-1)*BAR
for i in range(4):
    res['b102_%d'%i]=rms(base+i*BEAT, base+(i+1)*BEAT)
res['b101']=rms((101-1)*BAR,101*BAR)
res['b103']=rms((103-1)*BAR,103*BAR)
res['b87']=rms((87-1)*BAR,87*BAR)
res['b118']=rms((118-1)*BAR,118*BAR)
res['b119']=rms((119-1)*BAR,119*BAR)
res['b121']=rms((121-1)*BAR,121*BAR)
res['b122']=rms((122-1)*BAR,122*BAR)
res['b123']=rms((123-1)*BAR,123*BAR)
print(json.dumps(res))