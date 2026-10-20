# -*- coding: utf-8 -*-
import wave as wavemod
import numpy as np
import sys

def load(p):
    with wavemod.open(p) as w:
        sr = w.getframerate(); n = w.getnframes()
        d = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
    return d, sr

def stats(p, label):
    x, sr = load(p)
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1.0 / sr)
    cen = float((X * f).sum() / max(1e-9, X.sum()))
    tot = float((X ** 2).sum())
    bands = [(0,120),(120,500),(500,2000),(2000,6000),(6000,16000)]
    share = [float((X[(f>=a)&(f<b)]**2).sum()) / max(1e-12, tot) * 100 for a,b in bands]
    rms = float(np.sqrt(np.mean(x**2)))
    print('%-8s centroid %6.0f Hz | rms %.4f | peak %.3f | 0-120 %.1f%% 120-500 %.1f%% 500-2k %.1f%% 2-6k %.1f%% 6-16k %.1f%%'
          % (label, cen, rms, float(np.max(np.abs(x))), *share))

stats(sys.argv[1], '8bit')
stats(sys.argv[2], 'warm')
