# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json, io
x,sr=sf.read('tools/build/_yuk_kit/yukari_ph_stereo.wav', always_2d=True)
m=x.mean(axis=1); n=len(m)
def rms(a,b):
    seg=m[int(a*sr):int(b*sr)]
    return round(float(20*np.log10(np.sqrt(np.mean(seg**2))+1e-12)),2)
secs=[('intro',0,8.372),('A',8.372,30.698),('B',30.698,53.023),('A2',53.023,75.349),('C',75.349,97.674),('C2',97.674,120.0),('D',120.0,142.326),('D2',142.326,164.651),('END',164.651,168.14),('coda',168.14,170.93)]
res={k:rms(a,b) for k,a,b in secs}
win=int(0.4*sr); st=np.array([20*np.log10(np.sqrt(np.mean(m[i:i+win]**2))+1e-12) for i in range(0,n-win,win)])
body=np.mean([v for k,v in res.items() if k in ('A','C','C2','D','D2')])
out=dict(sections=res, body_mean=round(float(body),2), lra=round(float(np.percentile(st,90)-np.percentile(st,10)),2),
         p10=round(float(np.percentile(st,10)),2), p50=round(float(np.percentile(st,50)),2), p90=round(float(np.percentile(st,90)),2),
         peak=round(float(np.abs(m).max()),4), rms=round(float(20*np.log10(np.sqrt(np.mean(m**2)))),2))
io.open('tools/build/_yuk_kit/_v12_secs.json','w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=1))
