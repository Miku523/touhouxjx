import sys, soundfile as sf, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def prof(p, t0, t1):
    d, sr = sf.read(p, always_2d=True); x = d.mean(1).astype(np.float32)
    seg = x[int(t0*sr):int(min(t1, len(x)/sr)*sr)]
    X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
    f = np.fft.rfftfreq(len(seg), 1.0/sr); tot = X.sum()+1e-12
    b = [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    return b, round(float((f*X).sum()/tot)), round(float(np.sqrt((seg**2).mean())),3)
for p in ('tools/build/stage3_ateam_v2.wav','tools/build/stage3_ateam_v3.wav'):
    for t0,t1 in ((2,45),(52,95)):
        b,c,r = prof(p, t0, t1)
        print('%-38s %2d-%2ds 频段%s 质心%4d RMS %.3f' % (p.split('/')[-1], t0, t1, b, c, r))
