# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys
path = sys.argv[1]; t0=float(sys.argv[2]); t1=float(sys.argv[3]); fmax=float(sys.argv[4]) if len(sys.argv)>4 else 2500.0
x, sr = sf.read(path, always_2d=True); a = x.mean(axis=1)
F=8192; H=1024; win=np.hanning(F)
freqs=np.fft.rfftfreq(F,1.0/sr); semi=69+12*np.log2(np.maximum(freqs,1e-6)/440.0)
band = (freqs>=60)&(freqs<=fmax)
seg=a[int(t0*sr):int(t1*sr)]
vals=[]
for st in range(0,len(seg)-F,H):
    sp=np.abs(np.fft.rfft(seg[st:st+F]*win))*band
    idx=np.where((sp[1:-1]>sp[:-2])&(sp[1:-1]>sp[2:])&(sp[1:-1]>sp.max()*0.05))[0]+1
    if len(idx)<2: continue
    pk=sorted([(sp[i],semi[i]) for i in idx],reverse=True)[:14]
    r=0.0
    for u in range(len(pk)):
        for v in range(u+1,len(pk)):
            dd=abs(pk[u][1]-pk[v][1])
            if dd<2.0: r+=(pk[u][0]*pk[v][0])**0.5*(2.0-dd)
    vals.append((r,t0+st/sr))
va=np.array([v[0] for v in vals]); vals.sort(reverse=True)
print('%-26s fmax%5.0f frames %4d mean %6.2f p95 %6.2f max %7.2f worst@ %s' % (
  path.split('/')[-1], fmax, len(va), va.mean(), np.percentile(va,95), va.max(),
  ' '.join('%.2fs'%s for _,s in vals[:3])))
