# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json, io, sys
path = sys.argv[1] if len(sys.argv)>1 else 'tools/build/_yuk_kit/yukari_ph_mono.wav'
x, sr = sf.read(path, always_2d=True); a = x.mean(axis=1)
d = json.load(io.open('tools/build/_pret_lead/yukari_ph_secs.json', encoding='utf-8'))
seg_rng = {n:(t0,t1) for n,t0,t1 in d['secs']}
t0,t1 = seg_rng['A']
F=4096; H=1024; win=np.hanning(F)
freqs=np.fft.rfftfreq(F,1.0/sr); semi=69+12*np.log2(np.maximum(freqs,1e-6)/440.0)
seg=a[int(t0*sr):int(t1*sr)]
vals=[]
for st in range(0,len(seg)-F,H):
    sp=np.abs(np.fft.rfft(seg[st:st+F]*win))
    idx=np.where((sp[1:-1]>sp[:-2])&(sp[1:-1]>sp[2:])&(sp[1:-1]>sp.max()*0.02))[0]+1
    if len(idx)<2: continue
    pk=sorted([(sp[i],semi[i]) for i in idx],reverse=True)[:12]
    r=0.0
    for u in range(len(pk)):
        for v in range(u+1,len(pk)):
            dd=abs(pk[u][1]-pk[v][1])
            if dd<2.0: r+=(pk[u][0]*pk[v][0])**0.5*(2.0-dd)
    vals.append(r)
vals=np.array(vals)
print('A frames',len(vals),'mean %.2f'%vals.mean(),'p95 %.2f'%np.percentile(vals,95),'max %.2f'%vals.max())
