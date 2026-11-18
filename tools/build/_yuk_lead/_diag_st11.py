# -*- coding: utf-8 -*-
"""v11 立体声母版分析：段 RMS / 倍频程 / crest / LRA / 声像宽度 / 接缝"""
import numpy as np, soundfile as sf, json, sys
p = sys.argv[1]
x, sr = sf.read(p, always_2d=True)
L, R = x[:,0], x[:,1]
mono = x.mean(axis=1)
BAR = 4*60/172.0
secs = [('intro',1,6),('A',7,22),('B',23,38),('A2',39,54),('C',55,70),('C2',71,86),
        ('D',87,102),('D2',103,118),('END',119,121),('coda',122,123)]
out = {}
out['dur'] = round(len(x)/sr, 3)
out['peak'] = round(float(np.abs(x).max()), 4)
out['rms'] = round(20*np.log10(np.sqrt(np.mean(mono**2))), 2)
out['corr'] = round(float(np.corrcoef(L,R)[0,1]), 4)
mid = (L+R)/2; side = (L-R)/2
out['width_db'] = round(20*np.log10(np.sqrt(np.mean(side**2))/np.sqrt(np.mean(mid**2))), 2)
# crest
hop = int(sr*0.05); n = len(mono)//hop
st = np.array([np.sqrt(np.mean(mono[i*hop:(i+1)*hop]**2)) for i in range(n)])
sdb = 20*np.log10(st+1e-12)
out['crest'] = round(20*np.log10(np.abs(mono).max()) - 10*np.log10(np.mean(mono**2)), 2)
out['lra'] = round(float(np.percentile(sdb,95)-np.percentile(sdb,10)), 2)
sec_rms = {}
for nm,b0,b1 in secs:
    a=int((b0-1)*BAR*sr); b=min(int(b1*BAR*sr), len(mono))
    seg = mono[a:b]
    sec_rms[nm] = round(20*np.log10(np.sqrt(np.mean(seg**2))+1e-12), 2)
out['sections'] = sec_rms
# bands (octave)
f = np.fft.rfftfreq(len(mono), 1/sr); S = np.abs(np.fft.rfft(mono))
P = S**2
bands = [(20,40),(40,63),(63,125),(125,250),(250,500),(500,1000),(1000,2000),(2000,4000),(4000,8000),(8000,16000)]
tot = P.sum()
out['bands'] = {f'{a}-{b}': round(10*np.log10(P[(f>=a)&(f<b)].sum()/tot+1e-18), 2) for a,b in bands}
out['seam_L'] = round(float(abs(L[0]-L[-1])), 6)
out['seam_R'] = round(float(abs(R[0]-R[-1])), 6)
print(json.dumps(out, ensure_ascii=False, indent=1))