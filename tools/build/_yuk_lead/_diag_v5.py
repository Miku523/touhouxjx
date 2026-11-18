# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json, sys
SEC = [('intro',0.0,8.372),('A',8.372,30.698),('B',30.698,53.023),('A2',53.023,75.349),
       ('C',75.349,97.674),('C2',97.674,120.0),('D',120.0,142.326),('D2',142.326,164.651),
       ('END',164.651,168.14),('coda',168.14,173.721)]
def load(p):
    x, sr = sf.read(p, always_2d=True)
    return x.mean(axis=1), sr
def stats(m, sr, label):
    print('==', label, 'len %.3f' % (len(m)/sr))
    print('  RMS %.2f  peak %.4f  crest %.2f' % (20*np.log10(np.sqrt(np.mean(m**2))), np.abs(m).max(),
          20*np.log10(np.abs(m).max()/np.sqrt(np.mean(m**2)))))
    for nm,a,b in SEC:
        seg = m[int(a*sr):int(b*sr)]
        if len(seg)<100: continue
        print('  %-6s %6.1f-%6.1f  RMS %6.2f  peak %.3f' % (nm,a,b,20*np.log10(np.sqrt(np.mean(seg**2))+1e-12), np.abs(seg).max()))
    # bands
    spec = np.abs(np.fft.rfft(m))**2; f = np.fft.rfftfreq(len(m), 1/sr); tot = spec.sum()
    out = []
    for lo,hi in [(30,63),(63,125),(125,250),(250,500),(500,1000),(1000,2000),(2000,4000),(4000,8000)]:
        e = spec[(f>=lo)&(f<hi)].sum()/tot
        out.append('%d-%d:%.1f' % (lo,hi,10*np.log10(max(e,1e-12))))
    print('  bands', ' '.join(out))
    win = int(sr*0.4)
    st = 20*np.log10(np.sqrt([np.mean(m[i:i+win]**2) for i in range(0,len(m)-win,win)])+1e-12)
    print('  LRA p90-p10 %.2f  p10 %.2f p99 %.2f' % (np.percentile(st,90)-np.percentile(st,10), np.percentile(st,10), np.percentile(st,99)))
for p,l in [(sys.argv[1], 'v5'), (sys.argv[2],'v4') if len(sys.argv)>2 else (None,None)]:
    if not p: continue
    m,sr = load(p); stats(m,sr,l)
