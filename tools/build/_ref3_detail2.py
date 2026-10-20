# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3'
data, sr = sf.read(p, always_2d=True); x = data.mean(1).astype(np.float32)
hop=512; win=1024; N=len(x); frames=(N-win)//hop
flux=np.zeros(frames); prev=None
for i in range(frames):
    X=np.abs(np.fft.rfft(x[i*hop:i*hop+win]*np.hanning(win)))
    if prev is not None: flux[i]=np.maximum(0,X-prev).sum()
    prev=X
thr=flux.mean()+flux.std()*1.2
c=(flux[1:-1]>thr)&(flux[1:-1]>flux[:-2])&(flux[1:-1]>=flux[2:])
idx=np.where(c)[0]+1
print('端点密度: %.2f 次/秒' % (len(idx)/(frames*hop/sr)))
# 低频（底鼓）能量包络周期性
lowx = x.copy()
w = np.hanning(2048); X = np.fft.rfft(lowx[:2048]*w); f=np.fft.rfftfreq(2048,1/sr)
H = (f<110).astype(float)
from numpy.fft import irfft
low = np.convolve(x**2, np.ones(64)/64, 'same')
env = low[::256]; env = env-env.mean()
ac = np.correlate(env, env, 'full')[len(env)-1:]
fps = sr/256
cands=[]
for bpm in np.arange(60,200,0.2):
    lag=int(round(fps*60/bpm))
    if 0<lag<len(ac): cands.append((float(ac[lag]), round(bpm,1)))
cands.sort(reverse=True)
print('低频包络周期候选:', cands[:5])
seg = x[int(60*sr):int(120*sr)]
X=np.abs(np.fft.rfft(seg*np.hanning(len(seg)))); f=np.fft.rfftfreq(len(seg),1/sr)
ch=np.zeros(12)
for pc in range(12):
    lo=32.7*2**(pc/12.0); hi=lo*8
    ch[pc]=X[(f>=lo)&(f<hi)].sum()
ch=ch/ch.max()
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
order=np.argsort(-ch)
print('色谱前五:', [(names[i], round(float(ch[i]),2)) for i in order[:5]])
