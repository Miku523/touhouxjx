# -*- coding: utf-8 -*-
import sys, json, os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
secs = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']
w = wave.open(sys.argv[1], 'rb')
n, sr, nch = w.getnframes(), w.getframerate(), w.getnchannels()
x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
if nch > 1:
    x = x.reshape(-1, nch).mean(axis=1)
def db(v):
    return 20 * np.log10(np.sqrt((v ** 2).mean()) + 1e-12)
print('%s sr=%d peak=%.4f rms=%.2f' % (os.path.basename(sys.argv[1]), sr, np.abs(x).max(), db(x)))
for name, a, b in secs:
    seg = x[int(a * sr):int(b * sr)]
    if len(seg) < 64:
        continue
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    f = np.fft.rfftfreq(len(seg), 1.0 / sr)
    cen = (sp * f).sum() / max(sp.sum(), 1e-12)
    print('%-8s %7.3f-%7.3f  rms %6.2f  cen %5.0f' % (name, a, b, db(seg), cen))
