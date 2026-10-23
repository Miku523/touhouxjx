# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
x, sr = sf.read(r'tools/build/pre1_honou_v4.wav', dtype='float32', always_2d=True)
x = x.mean(axis=1)[:int(84.534*sr)]
hop = int(sr*0.010); frames = len(x)//hop
env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
med = np.median(env)
print('median env %.4f  p10 %.4f  p90 %.4f' % (med, np.percentile(env,10), np.percentile(env,90)))
low = env < med*0.12
runs=[]; i=0
while i < len(low):
    if low[i]:
        j=i
        while j < len(low) and low[j]: j+=1
        runs.append((i*0.01, j*0.01)); i=j
    else: i+=1
runs=[r for r in runs if r[1]-r[0]>=0.02]
runs.sort(key=lambda r: -(r[1]-r[0]))
print('低电平段 %d 个，总 %.2fs' % (len(runs), sum(b-a for a,b in runs)))
print('最长的 15 段：', ', '.join('%.2f-%.2f(%.2fs)' % (a,b,b-a) for a,b in runs[:15]))
print('全部段起点前 40 个：', ', '.join('%.2f' % a for a,b in sorted(runs)[:40]))
