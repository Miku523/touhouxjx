# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
for p in sys.argv[1:]:
    x, sr = sf.read(p, dtype='float32', always_2d=True)
    x = x.mean(axis=1)[:int(84.534*sr)]
    hop = int(sr*0.010); frames = len(x)//hop
    env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
    med = np.median(env)
    low = env < med*0.12
    # 前奏 0-17s 单独看
    ir = low[:1700].mean()*100
    runs=0; i=0
    while i < len(low):
        if low[i]:
            j=i
            while j<len(low) and low[j]: j+=1
            if j-i>=2: runs+=1
            i=j
        else: i+=1
    print('%-22s 峰 %.3f RMS %.4f 空隙率总 %4.1f%% (前奏 %4.1f%%) 空洞段 %3d 个' % (
        p.split('/')[-1], float(np.max(np.abs(x))), float(np.sqrt(np.mean(x**2))), low.mean()*100, ir, runs))
