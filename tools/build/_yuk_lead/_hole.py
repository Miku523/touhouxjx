# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, io
x, sr = sf.read('tools/build/_yuk_kit/yukari_ph_stereo.wav', always_2d=True)
m = x.mean(axis=1)
def win(a, b):
    i, j = int(a*sr), int(b*sr)
    w = m[i:j]
    r = np.sqrt((w*w).mean())
    return 20*np.log10(max(r, 1e-9))
lines = []
for t0 in np.arange(72.0, 82.0, 0.5):
    lines.append('%.1f-%.1f  %.1f dB' % (t0, t0+0.5, win(t0, t0+0.5)))
lines.append('--- coda')
for t0 in np.arange(172.0, 182.1, 1.0):
    lines.append('%.1f-%.1f  %.1f dB' % (t0, min(t0+1.0, 182.19), win(t0, t0+1.0)))
io.open('tools/build/_yuk_lead/hole.txt','w',encoding='utf-8').write('\n'.join(lines))
