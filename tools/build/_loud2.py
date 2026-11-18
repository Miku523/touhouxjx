# -*- coding: utf-8 -*-
import glob, json, io
import numpy as np, soundfile as sf
rows = []
for d in sorted(glob.glob('tools/build/_*_kit')):
    for p in sorted(glob.glob(d + '/*_stereo.wav')):
        if 'retired' in p: continue
        try:
            x, sr = sf.read(p, always_2d=True)
        except Exception:
            continue
        m = x.mean(axis=1)
        n = len(m)
        rms = 20*np.log10(np.sqrt(np.mean(m**2)) + 1e-12)
        pk = float(np.max(np.abs(m)))
        # bands
        X = np.fft.rfft(m * np.hanning(n))
        f = np.fft.rfftfreq(n, 1.0/sr)
        P = np.abs(X)**2
        def band(a,b):
            i = (f>=a)&(f<b)
            return 10*np.log10(P[i].sum()/n + 1e-12)
        cen = float((f*P).sum()/(P.sum()+1e-12))
        b = {'sub':band(20,63),'low':band(63,125),'lmid':band(125,500),'mid':band(500,2000),'himid':band(2000,6000),'hi':band(6000,12000)}
        rows.append(dict(name=p.split('\\')[-1].replace('_stereo.wav',''), dur=round(n/sr,1), rms=round(rms,2), peak=round(pk,3),
                         crest=round(20*np.log10(pk)-rms,2), cen=round(cen), **{k:round(v,1) for k,v in b.items()}))
io.open('tools/build/_loud2.txt','w',encoding='utf-8').write(json.dumps(rows, ensure_ascii=False, indent=0))
