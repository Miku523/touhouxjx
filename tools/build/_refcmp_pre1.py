# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def load(p):
    x, sr = sf.read(p, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    return x, sr
def prof(name, p):
    x, sr = load(p)
    dur = len(x)/sr
    hop = int(sr*0.010)
    frames = len(x)//hop
    env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
    med = np.median(env)
    gap = float(np.mean(env < med*0.12))
    # spectral flux onset count
    win = 1024
    n = len(x)//win
    S = np.abs(np.fft.rfft(x[:n*win].reshape(n,win)*np.hanning(win), axis=1))
    flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
    th = np.median(flux)*1.8 + flux.std()*0.8
    onsets = int(np.sum(flux > th))
    # bands
    freqs = np.fft.rfftfreq(win, 1/sr)
    P = (S**2).mean(axis=0)
    edges = [0,120,500,2000,6000,22050]
    tot = P.sum()+1e-12
    bands = [100*P[(freqs>=a)&(freqs<b)].sum()/tot for a,b in zip(edges[:-1],edges[1:])]
    cent = float((freqs*P).sum()/tot)
    print('%-14s dur %6.2fs  rms %.4f  空隙率(10ms) %4.1f%%  起音密度 %5.2f/s  频段 %s  质心 %4.0fHz' % (
        name, dur, float(np.sqrt(np.mean(x**2))), gap*100, onsets/dur,
        '[' + ','.join('%.0f'%b for b in bands) + ']', cent))
prof('ref mp3', r'tools/build/_ref_pre1.mp3')
prof('v3',      r'tools/build/pre1_honou_v3.wav')
