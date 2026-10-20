# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
name = sys.argv[1] if len(sys.argv) > 1 else 'stage3_ateam_v19.wav'
x, sr = sf.read(os.path.join(base, name))
if x.ndim > 1: x = x.mean(1)
def bands(seg):
    w=np.hanning(len(seg)); X=np.abs(np.fft.rfft(seg*w))**2; f=np.fft.rfftfreq(len(seg),1.0/sr)
    tot=X.sum()+1e-12
    return [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))], int((f*X).sum()/tot)
print('== %s  peak %.3f' % (name, float(np.abs(x).max())))
for nm,a,b in (('A前段 0-23.8',0,23.84),('渐强 23.8-28.6',23.84,28.61),('过渡 28.6-38.1',28.61,38.15),
               ('B 38.1-63.6',38.15,63.58),('C 63.6-89.0',63.58,89.01),('尾声 89-101.7',89.01,101.72)):
    seg=x[int(a*sr):int(b*sr)]; bd,c=bands(seg); rms=float(np.sqrt((seg**2).mean()))
    print('%-16s 频段 %-34s 质心 %4dHz RMS %.4f' % (nm, str(bd), c, rms))
