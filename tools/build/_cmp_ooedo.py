# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def prof(path, t0=0, t1=60):
    d,sr = sf.read(path, always_2d=True); x=d.mean(1).astype(np.float32)
    seg = x[int(t0*sr):int(min(t1, len(x)/sr)*sr)]
    X=np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2; f=np.fft.rfftfreq(len(seg),1/sr)
    tot=X.sum()+1e-12
    bands=[round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    cen=round(float((f*X).sum()/tot))
    rms=round(float(np.sqrt((seg**2).mean())),3); pk=round(float(np.abs(seg).max()),3)
    return bands, cen, rms, pk
b1,c1,r1,p1 = prof(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3', 24, 72)
b2,c2,r2,p2 = prof('tools/build/stage2_ooedo_v1.wav', 0, 48)
print('蓝本  频段%%', b1, '质心', c1, 'RMS', r1, '峰', p1, '(24-72s)')
print('新版  频段%%', b2, '质心', c2, 'RMS', r2, '峰', p2, '(0-48s)')
