# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, io, json
x, sr = sf.read('tools/build/_yuk_kit/yukari_ph_stereo.wav', always_2d=True)
m = x.mean(axis=1)
def win(a, b):
    w = m[int(a*sr):int(b*sr)]
    return 20*np.log10(max(float(np.sqrt((w*w).mean())), 1e-9))
out = []
for t0 in np.arange(168.0, 182.0, 1.0):
    out.append('%.0f-%.0f  %.1f dB' % (t0, t0+1, win(t0, min(t0+1, 182.19))))
io.open('tools/build/_yuk_lead/coda2.txt','w',encoding='utf-8').write('\n'.join(out))
print('ok')
