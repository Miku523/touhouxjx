# -*- coding: utf-8 -*-
# 版 3：多频段谱通量按 16 分格折叠，输出 refA 的鼓型
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'build'))
import _ref5_lib as L
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
x, sr = L.load_mono(p)
energy, flux, fps, bands = L.percussive(x, sr)
BPM = 162.0
beat = 60.0 / BPM
bar = 4 * beat
step = bar / 16.0
off = 0.955
groups = {'kick': [0], 'snare': [1, 2], 'hat': [3, 4]}
for name, idxs in groups.items():
    g = np.zeros(16); c = np.zeros(16)
    for b in range(8, 56):
        t0 = off + b * bar
        for s in range(16):
            t = t0 + s * step
            i = int(round(t * fps))
            seg = flux[max(0, i-6):i+6, idxs].sum(1) if i < len(flux) else np.zeros(1)
            if not len(seg): continue
            g[s] += seg.max(); c[s] += 1
    g = g / np.maximum(c, 1)
    g = g / (g.mean() + 1e-9)
    print('%-6s' % name, ' '.join('%+.2f' % (v - 1) for v in g))
    print('       相对强位(>+0.35):', [i for i in range(16) if g[i] - 1 > 0.35])
