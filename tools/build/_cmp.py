# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def prof(path, label, t0=8, t1=60):
    d, sr = sf.read(path, always_2d=True)
    x = d.mean(1) if d.ndim>1 else d
    x = x.astype(np.float32)
    seg = x[int(t0*sr):int(t1*sr)]
    X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
    f = np.fft.rfftfreq(len(seg),1/sr); tot=X.sum()+1e-12
    b=[round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    print('%-16s RMS %.3f 峰 %.3f 频段%s 质心 %dHz' % (label, float(np.sqrt((x**2).mean())), float(np.abs(x).max()), b, int((f*X).sum()/tot)))
args = sys.argv[1:]
for a in args:
    p = a if ':' not in a else a.split(':')[0]
    prof(p, p.split('\\')[-1])
prof(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref5_inst.mp3', '蓝本inst(20-90s)', 20, 90)
