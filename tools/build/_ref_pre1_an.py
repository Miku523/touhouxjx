# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
x, sr = sf.read(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref_pre1.mp3')
if x.ndim > 1: x = x.mean(axis=1)
print('ref %.2fs  sr %d  峰 %.3f RMS %.4f' % (len(x)/sr, sr, np.max(np.abs(x)), np.sqrt(np.mean(x**2))))
hop, nfft = 512, 2048
frames = np.lib.stride_tricks.sliding_window_view(x, nfft)[::hop]
win = np.hanning(nfft)
S = np.abs(np.fft.rfft(frames*win, axis=1))
f = np.fft.rfftfreq(nfft, 1/sr)
flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
flux /= (flux.max()+1e-9)
t = np.arange(len(flux))*hop/sr
# 主频段能量包络：低频(60-160 底鼓)、中(200-800)、高(4k-12k 镲)
def band(a,b):
    m=(f>=a)&(f<b)
    return S[:,m].sum(axis=1)
low, mid, high = band(50,180), band(200,900), band(5000,12000)
high /= (high.max()+1e-9)
# 速度估计：flux 自相关
env = flux - flux.mean()
ac = np.correlate(env, env, 'full')[len(env)-1:]
lagmin, lagmax = int(0.28*sr/hop), int(0.55*sr/hop)
best = lagmin + int(np.argmax(ac[lagmin:lagmax]))
print('估计周期 %.3fs -> %.1f BPM' % (best*hop/sr, 60/(best*hop/sr)))
# 16 分网格（按 145 BPM）
for bpm in (145.0, 60/(best*hop/sr)):
    e16 = 60.0/bpm/4.0
    idx = np.round(t/e16).astype(int)
    prof = np.zeros(16); cnt = np.zeros(16)
    for i, k in enumerate(idx):
        prof[k%16] += flux[i]; cnt[k%16] += 1
    prof /= np.maximum(cnt,1)
    print('bpm %.2f 的 16 分 flux 轮廓: %s' % (bpm, ' '.join('%.2f'%v for v in prof)))
    ph = np.zeros(16); cnt2 = np.zeros(16)
    for i, k in enumerate(idx):
        ph[k%16] += high[i]; cnt2[k%16] += 1
    ph /= np.maximum(cnt2,1)
    print('   高频(镲)轮廓: %s' % (' '.join('%.2f'%v for v in ph)))
