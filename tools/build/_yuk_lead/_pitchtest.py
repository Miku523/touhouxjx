# -*- coding: utf-8 -*-
import numpy as np, sys
sys.path.insert(0,'tools/build')
import _exsr_render as R
rng = np.random.default_rng(7)
m = 70
f0 = 440.0*2**((m-69)/12.0)
y = R.voice_lead(f0, 0.30, 90, rng)
sr = R.SR
def measure(y, sr, f0, off, win=0.08):
    i0=int(off*sr); i1=i0+int(win*sr)
    seg=y[i0:i1]*np.hanning(i1-i0)
    sp=np.abs(np.fft.rfft(seg,1<<15)); fr=np.fft.rfftfreq(1<<15,1/sr)
    msk=(fr>f0*0.85)&(fr<f0*1.18)
    k=np.argmax(sp*msk)
    return 1200*np.log2(fr[k]/f0)
print('SR', sr, 'f0', round(f0,2))
for off in (0.05,0.10,0.18):
    print('  off %.2fs  dev %+.1f cents' % (off, measure(y, sr, f0, off)))
# same measurement on a pure sine for calibration
t=np.arange(int(0.5*sr))/sr
ys=np.sin(2*np.pi*f0*t)
for off in (0.05,0.10):
    print('  sine off %.2fs dev %+.1f' % (off, measure(ys, sr, f0, off)))
