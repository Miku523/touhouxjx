# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xm, sr = L.load_mono('tools/build/ex_tepes_v08.wav')
seg = xm[int(0.2*sr):int(2.0*sr)]
w = np.hanning(len(seg))
N = 1 << 18
mag = np.abs(np.fft.rfft(seg*w, N))
freqs = np.fft.rfftfreq(N, 1.0/sr)
band = (freqs > 30) & (freqs < 400)
idx = np.where(band)[0]
top = idx[np.argsort(-mag[band])[:14]]
for k in sorted(top, key=lambda k: -mag[k]):
    f = freqs[k]
    m = 69 + 12*np.log2(f/440.0)
    print('%7.2f Hz  midi %.1f  %s%d  mag %.3f' % (f, m, PC[int(round(m))%12], int(round(m))//12-1, mag[k]))
