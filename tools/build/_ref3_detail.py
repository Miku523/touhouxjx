# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3'
data, sr = sf.read(p, always_2d=True)
x = data.mean(axis=1).astype(np.float32)
N = len(x); dur = N/sr
def bands(seg):
    w = np.hanning(len(seg)); X = np.abs(np.fft.rfft(seg*w))**2
    f = np.fft.rfftfreq(len(seg), 1.0/sr)
    tot = X.sum()+1e-12
    out=[]
    for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000)):
        out.append(round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1))
    cen = float((f*X).sum()/tot)
    return out, round(cen)
print('总时长 %.1fs' % dur)
print('时间 | RMS | 频段% (0-120,120-500,500-2k,2-6k,6-16k) | 质心Hz')
for t0 in np.arange(0, dur-4, 12):
    seg = x[int(t0*sr):int((t0+4)*sr)]
    rms = float(np.sqrt((seg**2).mean()))
    b, c = bands(seg)
    print('  %5.0fs  %.3f  %s  %d' % (t0, rms, b, c))
# 打击密度：谱通量峰值
hop=512; win=1024
frames = (N-win)//hop
flux = np.zeros(frames)
prev = None
for i in range(frames):
    seg = x[i*hop:i*hop+win]
    X = np.abs(np.fft.rfft(seg*np.hanning(win)))
    if prev is not None:
        flux[i] = np.maximum(0, X-prev).sum()
    prev = X
thr = flux.mean()+flux.std()*1.2
onsets = np.where((flux[1:]>thr)&(flux[1:]>flux[:-1])&(flux[1:]>=flux[2:]))[0]
print('端点密度: %.2f 次/秒 (阈值 %.1f)' % (len(onsets)/(frames*hop/sr), thr))
# 色谱（调性）用后半段
seg = x[int(60*sr):int(120*sr)]
X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))
f = np.fft.rfftfreq(len(seg), 1.0/sr)
chroma = np.zeros(12)
for pc in range(12):
    lo = 32.7*2**((pc)/12); hi = lo*8
    m = (f>=lo)&(f<hi)
    chroma[pc] = X[m].sum()
chroma = chroma/chroma.max()
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
print('色谱:', ' '.join('%s%.2f'%(names[i],chroma[i]) for i in range(12)))
