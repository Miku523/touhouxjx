# -*- coding: utf-8 -*-
import sys, json, os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']
def load(p):
    w = wave.open(p, 'rb'); n, sr, nch = w.getnframes(), w.getframerate(), w.getnchannels()
    x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
    if nch > 1: x = x.reshape(-1, nch).mean(axis=1)
    return x, sr
def db(v): return 20*np.log10(np.sqrt((v**2).mean())+1e-12)
for name in sys.argv[2:]:
    x, sr = load(os.path.join(sys.argv[1], name))
    line = ['%-14s peak %6.3f' % (name, np.abs(x).max())]
    for sn, a, b in secs:
        seg = x[int(a*sr):int(b*sr)]
        line.append('%s %6.1f' % (sn[:6], db(seg)))
    print(' | '.join(line))
print()
print('band of bass/sub/drums (dB rel total):')
for name in ('07_bass.wav', '08_wavesine.wav', '90_drums.wav'):
    x, sr = load(os.path.join(sys.argv[1], name))
    sp = np.abs(np.fft.rfft(x))
    f = np.fft.rfftfreq(len(x), 1.0/sr)
    tot = (sp**2).sum()
    out = []
    for lo, hi in ((20,63),(63,125),(125,250),(250,500),(500,1000)):
        m = (f>=lo)&(f<hi)
        out.append('%d-%d %5.1f' % (lo, hi, 10*np.log10((sp[m]**2).sum()/tot + 1e-30)))
    print('%-14s %s' % (name, ' | '.join(out)))
