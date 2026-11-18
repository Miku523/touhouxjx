# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, glob, os, io, sys, json
d = json.load(io.open('tools/build/_pret_lead/yukari_ph_secs.json', encoding='utf-8'))
A = dict((n,(t0,t1)) for n,t0,t1 in d['secs'])['A']
t0, t1 = A
F=8192; H=1024
def rough(y, sr, fmax=1500.0):
    win=np.hanning(F); freqs=np.fft.rfftfreq(F,1.0/sr); semi=69+12*np.log2(np.maximum(freqs,1e-6)/440.0)
    band=(freqs>=60)&(freqs<=fmax)
    vals=[]
    for st in range(0,len(y)-F,H):
        sp=np.abs(np.fft.rfft(y[st:st+F]*win))*band
        idx=np.where((sp[1:-1]>sp[:-2])&(sp[1:-1]>sp[2:])&(sp[1:-1]>sp.max()*0.05))[0]+1
        if len(idx)<2: continue
        pk=sorted([(sp[i],semi[i]) for i in idx],reverse=True)[:12]
        r=0.0
        for u in range(len(pk)):
            for v in range(u+1,len(pk)):
                dd=abs(pk[u][1]-pk[v][1])
                if dd<2.0: r+=(pk[u][0]*pk[v][0])**0.5*(2.0-dd)
        vals.append(r)
    return float(np.mean(vals)) if vals else 0.0
out=[]
for p in sorted(glob.glob('tools/build/_yuk_kit/stems_v4/*.wav')):
    y, sr = sf.read(p)
    if y.ndim>1: y=y.mean(axis=1)
    seg=y[int(t0*sr):int(t1*sr)]
    r=rough(seg, sr)
    rms=20*np.log10(max(float(np.sqrt((seg**2).mean())),1e-9))
    out.append((r, rms, os.path.basename(p)))
out.sort(reverse=True)
for r, rms, n in out: print('%-22s rough %8.2f  rms %6.1f' % (n, r, rms))
