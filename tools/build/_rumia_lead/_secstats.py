# -*- coding: utf-8 -*-
import os, json, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
SRC = os.path.join(HERE, '..', '..', '..', 'tools', 'build', '_rumia_kit', 'youma_stage1_stereo.wav')
with wave.open(SRC) as w:
    sr = w.getframerate(); n = w.getnframes(); nch = w.getnchannels()
    raw = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
x = raw.reshape(-1, nch)
mono = x.mean(axis=1)
def db(v): return 20*np.log10(max(1e-12, v))
order = ['intro','organ','vibes','theme','theme2','bridge','var1','var2','coda']
print('%-8s %8s %8s %8s %8s %8s %8s' % ('sec','rms','centroid','corr','width','band<125','band>4k'))
for k in order:
    a, b = SEC[k]; i0, i1 = int(a*sr), int(b*sr)
    seg = x[i0:i1]
    m = mono[i0:i1]
    rms = np.sqrt(np.mean(seg**2))
    F = np.fft.rfft(m * np.hanning(len(m)))
    fr = np.fft.rfftfreq(len(m), 1/sr)
    mag = np.abs(F) + 1e-12
    cent = float((fr * mag).sum() / mag.sum())
    corr = float(np.corrcoef(seg[:,0], seg[:,1])[0,1]) if nch > 1 else 1.0
    side = (seg[:,0] - seg[:,1]) / 2 if nch > 1 else np.zeros(len(seg))
    mid = seg.mean(axis=1)
    width = db(np.sqrt(np.mean(side**2))) - db(np.sqrt(np.mean(mid**2)))
    def bandpow(lo, hi):
        f2 = np.fft.rfft(m); fq = np.fft.rfftfreq(len(m), 1/sr)
        f2[(fq < lo) | (fq >= hi)] = 0
        y = np.fft.irfft(f2, len(m))
        return np.sqrt(np.mean(y**2))
    lo = db(bandpow(20, 125)) - db(np.sqrt(np.mean(m**2)))
    hi = db(bandpow(4000, 16000)) - db(np.sqrt(np.mean(m**2)))
    print('%-8s %8.2f %8.0f %8.3f %8.2f %8.2f %8.2f' % (k, db(rms), cent, corr, width, lo, hi))
