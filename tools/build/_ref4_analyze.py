# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
names = ['ref4a','ref4b','ref4c']
base = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site'
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def tempo(x, sr, fps=100):
    hop = sr//fps; win = hop*4
    n = (len(x)-win)//hop
    env = np.array([np.sqrt((x[i*hop:i*hop+win]**2).mean()) for i in range(n)])
    env = env - env.mean()
    ac = np.correlate(env, env, 'full')[len(env)-1:]
    res = []
    for bpm in np.arange(60, 220, 0.2):
        lag = int(round(fps*60/bpm))
        if 0 < lag < len(ac): res.append((float(ac[lag]), round(bpm,1)))
    res.sort(reverse=True)
    return res[:3]
for nm in names:
    p = os.path.join(base, nm + '.mp3')
    d, sr = sf.read(p, always_2d=True)
    x = d.mean(1).astype(np.float32)
    dur = len(x)/sr
    rms = float(np.sqrt((x**2).mean())); peak = float(np.abs(x).max())
    print('=== %s  %.1fs  sr %d  RMS %.3f  peak %.2f' % (nm, dur, sr, rms, peak))
    print('   速度候选:', [(round(s,3), b) for s, b in tempo(x, sr)])
    # 频段（中段）
    seg = x[int(dur*0.2*sr):int(dur*0.6*sr)]
    X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
    f = np.fft.rfftfreq(len(seg), 1.0/sr); tot = X.sum()+1e-12
    bands = [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    print('   频段 [0-120,%s] 质心 %dHz' % (','.join(map(str,bands)), int((f*X).sum()/tot)))
    # 色谱（duration 简化为能量）
    seg2 = x[int(dur*0.15*sr):int(dur*0.75*sr)]
    X2 = np.abs(np.fft.rfft(seg2*np.hanning(len(seg2)))); f2 = np.fft.rfftfreq(len(seg2), 1.0/sr)
    ch = np.zeros(12)
    for pc in range(12):
        lo = 32.7*2**(pc/12.0); hi = lo*8
        ch[pc] = X2[(f2>=lo)&(f2<hi)].sum()
    ch = ch/ch.max(); order = np.argsort(-ch)[:5]
    print('   色谱前五:', [(NAMES[i], round(float(ch[i]),2)) for i in order])
