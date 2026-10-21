# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\septette_zun.mp3'
y, sr = sf.read(p, dtype='float32', always_2d=True); x = y.mean(1)
K = 160.0/145.0; OFF = 2.48
def my2ref(t): return OFF + t*K
def rms(a, b): return float(np.sqrt((x[int(a*sr):int(b*sr)]**2).mean()))
print('my 12-20s -> ref %.1f-%.1f  %.3f' % (my2ref(12), my2ref(20), rms(my2ref(12), my2ref(20))))
print('my 22-27s -> ref %.1f-%.1f  %.3f' % (my2ref(22), my2ref(27), rms(my2ref(22), my2ref(27))))
print('my 27-33s -> ref %.1f-%.1f  %.3f' % (my2ref(27), my2ref(33), rms(my2ref(27), my2ref(33))))
print('my 33-40s -> ref %.1f-%.1f  %.3f' % (my2ref(33), my2ref(40), rms(my2ref(33), my2ref(40))))
