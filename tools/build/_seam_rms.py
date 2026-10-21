# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
def env(x, sr, t, w=0.25):
    return float(np.sqrt((x[int(max(0,(t-w))*sr):int((t+w)*sr)]**2).mean()))
for name in ('pre4_fall_v15.wav', 'pre4_fall_v16.wav'):
    x, sr = sf.read(os.path.join(base, name))
    if x.ndim > 1: x = x.mean(1)
    print('==', name)
    for t, label in ((5.89, '前奏→主体 5.89s'), (53.01, '主体→尾声 53.01s'), (58.90, '循环点 58.90s')):
        a = env(x, sr, t-0.6); b = env(x, sr, t-0.05); c = env(x, sr, t+0.05); d = env(x, sr, t+0.6)
        print('  %-16s  -0.6s %.3f  -0.05s %.3f | +0.05s %.3f  +0.6s %.3f   跳变 %+.1f dB'
              % (label, a, b, c, d, 20*np.log10(max(c,1e-9)/max(b,1e-9))))
