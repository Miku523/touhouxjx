# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
from numpy.fft import rfft, irfft, rfftfreq
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref6_ateam.mp3'
d, sr = sf.read(p, always_2d=True); x = d.mean(1).astype(np.float32)
N=len(x); X=np.fft.rfft(x); f=np.fft.rfftfreq(N,1/sr)
def band(lo,hi):
    Y=np.zeros_like(X); m=(f>=lo)&(f<hi); Y[m]=X[m]; return np.abs(irfft(Y,N))
low = band(35,105); mid = band(180,900); high = band(3500,12000)
def env(sig, hop=256):
    n=len(sig)//hop
    return np.sqrt((sig[:n*hop].reshape(n,hop)**2).mean(1))
e_low, e_mid, e_high = env(low), env(mid), env(high)
fps = sr/256
def peaks(e, ratio=1.5, gap=0.12):
    thr = e.mean()*ratio; out=[]
    for i in range(1,len(e)-1):
        if e[i]>thr and e[i]>=e[i-1] and e[i]>e[i+1]:
            if not out or (i-out[-1])/fps > gap: out.append(i)
    return np.array(out)/fps
tl, tm, th = peaks(e_low,1.8), peaks(e_mid,1.8), peaks(e_high,1.6)
bpm=151.4; beat=60/bpm; bar=4*beat
print('bpm %.1f  beat %.3fs  bar %.3fs' % (bpm, beat, bar))
for name, ts in (('底鼓 35-105Hz', tl), ('军鼓/中频', tm), ('高频镲', th)):
    ts = ts[(ts>20)&(ts<170)]
    ph = np.mod(ts, bar)
    h,_ = np.histogram(ph, bins=16, range=(0,bar))
    print(name, '共 %d 击' % len(ts))
    for k in range(16):
        print('   %5.2f 拍 %s' % (k*bar/16/beat, '#'*int(h[k]/max(1,h.max())*30)))
