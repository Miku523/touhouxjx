# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3'
try:
    info = sf.info(p)
    print('sf.info:', info.samplerate, info.channels, info.frames, '%.2fs' % (info.frames/info.samplerate), info.subtype)
    data, sr = sf.read(p, always_2d=True)
except Exception as e:
    print('读取失败:', e); raise SystemExit(1)
x = data.mean(axis=1).astype(np.float32)
print('峰值', round(float(np.abs(x).max()),3), 'RMS', round(float(np.sqrt((x**2).mean())),4))
# 速度：用后半段（鼓稳定处）做能量包络自相关
def tempo_est(x, sr, t0, t1):
    seg = x[int(t0*sr):int(t1*sr)]
    hop = 256; win = 1024
    n = (len(seg)-win)//hop
    env = np.array([np.sqrt((seg[i*hop:i*hop+win]**2).mean()) for i in range(n)])
    env = env - env.mean()
    ac = np.correlate(env, env, 'full')[len(env)-1:]
    fps = sr/hop
    lo, hi = 60, 200
    best = []
    for bpm in np.arange(lo, hi, 0.1):
        lag = int(round(fps*60.0/bpm))
        if 0 < lag < len(ac):
            best.append((ac[lag], bpm))
    best.sort(reverse=True)
    return best[:5]
for span in ((40, 120), (60, 140)):
    print('段', span, '速度候选:', [(round(float(s),4), round(b,1)) for s,b in tempo_est(x, sr, *span)])
