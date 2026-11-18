# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys
path, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
x, sr = sf.read(path, always_2d=True); a = x.mean(axis=1)
F=4096; H=1024; win=np.hanning(F)
freqs=np.fft.rfftfreq(F,1.0/sr); semi=69+12*np.log2(np.maximum(freqs,1e-6)/440.0)
seg=a[int(t0*sr):int(t1*sr)]
vals=[]; worst=[]
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
    vals.append((r, t0+st/sr))
vals_a=np.array([v[0] for v in vals])
vals.sort(reverse=True)
print('%s  frames %d  mean %.2f  p95 %.2f  max %.2f  worst@ %.2fs %.2fs %.2fs' % (
    path.split('/')[-1], len(vals_a), vals_a.mean(), np.percentile(vals_a,95), vals_a.max(),
    vals[0][1], vals[1][1], vals[2][1]))
