# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref4.mp3'
d, sr = sf.read(p, always_2d=True); x = d.mean(1).astype(np.float32)
print('时长 %.1fs / %d ch / %d Hz' % (len(x)/sr, d.shape[1], sr))
print('RMS %.3f 峰 %.3f 左右相关 %.3f' % (np.sqrt((x**2).mean()), np.abs(x).max(), np.corrcoef(d[:,0], d[:,1])[0,1]))
def tempo(x, sr, t0, t1):
    seg = x[int(t0*sr):int(t1*sr)]; hop=256; win=1024
    n=(len(seg)-win)//hop
    env=np.array([np.sqrt((seg[i*hop:i*hop+win]**2).mean()) for i in range(n)]); env-=env.mean()
    ac=np.correlate(env,env,'full')[len(env)-1:]; fps=sr/hop
    c=[]
    for bpm in np.arange(60,220,0.2):
        lag=int(round(fps*60/bpm))
        if 0<lag<len(ac): c.append((float(ac[lag]), round(bpm,1)))
    c.sort(reverse=True); return c[:4]
for span in ((30,90),(90,180),(180,260)):
    print('%d-%ds 速度候选' % span, [(round(s,2),b) for s,b in tempo(x,sr,*span)])
print('时间 | RMS | 频段% | 质心')
for t0 in np.arange(0, len(x)/sr-4, 20):
    seg = x[int(t0*sr):int((t0+6)*sr)]
    X=np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2; f=np.fft.rfftfreq(len(seg),1/sr); tot=X.sum()
    b=[round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    print(' %4.0fs  %.3f  %s  %d' % (t0, float(np.sqrt((seg**2).mean())), b, round(float((f*X).sum()/tot))))
