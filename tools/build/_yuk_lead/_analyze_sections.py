# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json, io, sys
path = sys.argv[1] if len(sys.argv)>1 else 'tools/build/_yuk_kit/yukari_ph_stereo.wav'
x, sr = sf.read(path, always_2d=True)
m = x.mean(axis=1)
d = json.load(io.open('tools/build/_pret_lead/yukari_ph_secs.json', encoding='utf-8'))
secs = d['secs']
rows = []
for name,t0,t1 in secs:
    seg = m[int(t0*sr):int(t1*sr)]
    if len(seg)<1024: continue
    rms = 20*np.log10(max(float(np.sqrt((seg**2).mean())),1e-9))
    n = len(seg); w = np.hanning(n)
    S = np.abs(np.fft.rfft(seg*w))**2
    f = np.fft.rfftfreq(n, 1/sr)
    def band(a,b):
        msk=(f>=a)&(f<b); return float(S[msk].sum())
    tot=float(S.sum())+1e-20
    cen=float((S*f).sum()/tot)
    rows.append(dict(sec=name, t0=round(t0,2), t1=round(t1,2), rms=round(rms,1), cen=round(cen),
                     low=round(10*np.log10((band(40,250)+1e-20)/tot),1),
                     mid=round(10*np.log10((band(300,3000)+1e-20)/tot),1),
                     hi=round(10*np.log10((band(4000,12000)+1e-20)/tot),1)))
print(json.dumps(rows, ensure_ascii=False))
