# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys
def bands(p, a, b):
    x, sr = sf.read(p, always_2d=True); m = x.mean(axis=1)
    seg = m[int(a*sr):int(b*sr)]
    spec = np.abs(np.fft.rfft(seg))**2; f = np.fft.rfftfreq(len(seg),1/sr); tot = spec.sum()
    o = []
    for lo,hi in [(30,63),(63,125),(125,250),(250,500),(500,1000),(1000,2000),(2000,4000),(4000,8000)]:
        o.append('%d-%d:%5.1f' % (lo,hi,10*np.log10(max(spec[(f>=lo)&(f<hi)].sum()/tot,1e-12))))
    print('%-28s %s' % (p.split('/')[-1]+' %.0f-%.0fs'%(a,b), ' '.join(o)))
for p in sys.argv[1:]:
    for a,b in [(8.4,30.7),(120.0,142.3)]:
        bands(p,a,b)
