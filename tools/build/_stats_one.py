# -*- coding: utf-8 -*-
import wave as wavemod, numpy as np, sys
def stats(path):
    with wavemod.open(path,'rb') as w:
        sr=w.getframerate(); n=w.getnframes(); raw=w.readframes(n)
    x=np.frombuffer(raw,dtype='<i2').astype(np.float64)/32768.0
    if x.ndim>1: x=x.mean(axis=1)
    spec=np.abs(np.fft.rfft(x)); freq=np.fft.rfftfreq(len(x),1.0/sr)
    p=spec**2; tot=p.sum()
    bands=[(0,120),(120,500),(500,2000),(2000,6000),(6000,16000)]
    bp=[100*p[(freq>=a)&(freq<b)].sum()/tot for a,b in bands]
    centroid=(freq*p).sum()/tot
    print('%-34s %6.1fs peak=%.3f rms=%.3f centroid=%4.0fHz bands=%s' % (
        path.split('/')[-1].split('\\')[-1], n/sr, np.abs(x).max(), np.sqrt((x**2).mean()),
        centroid, ' '.join('%d%%'%round(b) for b in bp)))
for p in sys.argv[1:]:
    stats(p)
