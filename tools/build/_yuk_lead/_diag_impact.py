# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys, json
p = 'tools/build/_yuk_kit/yukari_ph_stereo.wav'
x, sr = sf.read(p, always_2d=True)
m = x.mean(axis=1)
n = len(m)
win = int(sr*0.4)
st = np.array([np.sqrt(np.mean(m[i:i+win]**2)) for i in range(0, n-win, win)])
st_db = 20*np.log10(np.maximum(st,1e-9))
print('RMS total', round(20*np.log10(np.sqrt(np.mean(m**2))),2))
print('peak', round(float(np.max(np.abs(m))),4), 'crest', round(20*np.log10(np.max(np.abs(m))/np.sqrt(np.mean(m**2))),2))
print('short-term p10/p50/p90/p99', [round(float(np.percentile(st_db,q)),2) for q in (10,50,90,99)])
print('LRA(p90-p10)', round(float(np.percentile(st_db,90)-np.percentile(st_db,10)),2))
# octave bands
spec = np.abs(np.fft.rfft(m))**2
freq = np.fft.rfftfreq(n, 1/sr)
tot = spec.sum()
for lo,hi in [(20,40),(40,63),(63,125),(125,250),(250,500),(500,1000),(1000,2000),(2000,4000),(4000,8000),(8000,16000)]:
    e = spec[(freq>=lo)&(freq<hi)].sum()/tot
    print('band %5d-%5d %6.2f dB' % (lo,hi,10*np.log10(max(e,1e-12))))
