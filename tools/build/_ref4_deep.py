# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site'
for nm in ('ref4a','ref4b','ref4c'):
    d, sr = sf.read(os.path.join(base, nm+'.mp3'), always_2d=True)
    x = d.mean(1).astype(np.float32)
    dur = len(x)/sr
    # 低频包络（底鼓）
    y = x**2
    k = np.ones(int(sr*0.01))/int(sr*0.01)
    env = np.convolve(y, k, 'same')[::int(sr*0.01)]
    env = env - env.mean()
    fps = 100.0
    ac = np.correlate(env, env, 'full')[len(env)-1:]
    res = []
    for bpm in np.arange(60, 220, 0.2):
        lag = int(round(fps*60/bpm))
        if 0 < lag < len(ac): res.append((float(ac[lag]), round(bpm,1)))
    res.sort(reverse=True)
    cand = res[:4]
    # 分段 RMS + 低频占比
    print('=== %s %.1fs' % (nm, dur))
    print('   低频包络速度候选:', [(round(s,2), b) for s, b in cand])
    seg = dur/8
    for i in range(8):
        a, b = i*seg, (i+1)*seg
        s = x[int(a*sr):int(b*sr)]
        rms = float(np.sqrt((s**2).mean()))
        X = np.abs(np.fft.rfft(s*np.hanning(len(s))))**2
        f = np.fft.rfftfreq(len(s), 1.0/sr); tot = X.sum()+1e-12
        low = float(X[f<120].sum()/tot*100)
        print('   %5.1f-%5.1fs RMS %.3f 低频 %4.1f%% 质心 %4d' % (a, b, rms, low, int((f*X).sum()/tot)))
