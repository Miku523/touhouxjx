# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def load(p):
    x, sr = sf.read(p, dtype='float32', always_2d=True)
    return x.mean(axis=1), sr
def prof(name, p, loop=None):
    x, sr = load(p)
    if loop: x = x[:int(loop*sr)]
    dur = len(x)/sr
    hop = int(sr*0.010)
    frames = len(x)//hop
    env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
    med = np.median(env)
    gap = float(np.mean(env < med*0.12))
    win = 1024
    n = len(x)//win
    S = np.abs(np.fft.rfft(x[:n*win].reshape(n,win)*np.hanning(win), axis=1))
    freqs = np.fft.rfftfreq(win, 1/sr)
    P = (S**2).mean(axis=0); tot = P.sum()+1e-12
    edges = [0,120,500,2000,6000,22050]
    bands = [100*P[(freqs>=a)&(freqs<b)].sum()/tot for a,b in zip(edges[:-1],edges[1:])]
    cent = float((freqs*P).sum()/tot)
    print('%-10s dur %6.2fs  峰 %.3f  RMS %.4f  空隙率 %4.1f%%  频段 %s  质心 %4.0fHz' % (
        name, dur, float(np.max(np.abs(x))), float(np.sqrt(np.mean(x**2))), gap*100,
        '[' + ','.join('%.0f'%b for b in bands) + ']', cent))
    return gap
prof('ref mp3', r'tools/build/_ref_pre1.mp3')
prof('v3', r'tools/build/pre1_honou_v3.wav', 84.534)
prof('v4', r'tools/build/pre1_honou_v4.wav', 84.534)
