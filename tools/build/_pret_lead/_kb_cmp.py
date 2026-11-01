# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def stat(p):
    x, sr = sf.read(p, always_2d=True); m = x.mean(axis=1)
    seg = m[:len(m)//4096*4096]
    X = np.fft.rfft(seg*np.hanning(len(seg))); f = np.fft.rfftfreq(len(seg),1.0/sr)
    tot = float(np.sum(np.abs(X)**2)); b = (f>=63)&(f<125)
    rms = 20*np.log10(np.sqrt(np.mean(m**2)))
    pk = float(np.max(np.abs(m)))
    return dict(rms=rms, peak=pk, low=10*np.log10(float(np.sum(np.abs(X[b])**2))/tot))
for p in ('tools/build/_pret_kit/pre1_v70_mono.wav','tools/build/_pret_kit/pre1_kb26.wav',
          'tools/build/_pret_kit/pre4_v70_mono.wav','tools/build/_pret_kit/pre4_kb22.wav'):
    d = stat(p)
    print('%-46s rms %6.2f peak %.4f 63-125 %6.2f' % (p.split('/')[-1], d['rms'], d['peak'], d['low']))
# 峰值位置
for p in ('tools/build/_pret_kit/pre1_kb26.wav','tools/build/_pret_kit/pre4_kb22.wav','tools/build/_pret_kit/pre2_v70_mono.wav'):
    x, sr = sf.read(p, always_2d=True); m = x.mean(axis=1)
    i = int(np.argmax(np.abs(m)))
    print(p.split('/')[-1], 'peak at %.2fs' % (i/sr), 'val %.4f' % m[i])
