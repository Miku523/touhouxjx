# -*- coding: utf-8 -*-
# 从 refA 音频扒鼓型：按 16 分格折叠统计 kick/snare/hat 强度
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'build'))
import _ref5_lib as L

p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
x, sr = L.load_mono(p)
BPM = 162.0
bar = 4 * 60.0 / BPM
step = bar / 16.0
off = 0.955
n_fft, hop = 1024, 128
fps = sr / hop
win = np.hanning(n_fft)
frames = (len(x) - n_fft) // hop
mag = np.empty((frames, n_fft // 2 + 1), np.float32)
for i in range(frames):
    mag[i] = np.abs(np.fft.rfft(x[i*hop:i*hop+n_fft] * win))[:n_fft//2+1]
freqs = np.fft.rfftfreq(n_fft, 1.0/sr)
def band(lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return mag[:, m].sum(1)
kick = band(40, 110)
snare = band(180, 320) + band(2500, 5200)
hat = band(6500, 12000)
def env(raw):
    d = np.diff(np.log1p(raw * 20))
    d[d < 0] = 0
    return d
ke, se, he = env(kick), env(snare), env(hat)
kstep = int(round(step * fps))
nbar = 68
def fold(e):
    grid = np.zeros(16)
    cnt = np.zeros(16)
    for b in range(8, 56):
        t0 = off + b * bar
        for s in range(16):
            t = t0 + s * step
            i = int(round(t * fps))
            seg = e[max(0, i-2):i+2]
            if len(seg) == 0: continue
            grid[s] += seg.max(); cnt[s] += 1
    return grid / np.maximum(cnt, 1)
for name, e in (('kick', ke), ('snare', se), ('hat', he)):
    g = fold(e)
    g = g / (g.max() or 1)
    print('%-6s' % name, ' '.join('%.2f' % v for v in g))
    print('       强位:', [i for i in range(16) if g[i] > 0.45])
