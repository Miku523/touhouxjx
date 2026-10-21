# -*- coding: utf-8 -*-
# 网格搜索：找让 snare 落在 4/12、kick 落在 0/8 的相位
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
beat = 60.0 / BPM; bar = 4 * beat; step = bar / 16
def fold(idxs, off):
    g = np.zeros(16); c = np.zeros(16)
    for b in range(10, 54):
        t0 = off + b * bar
        for s in range(16):
            i = int(round((t0 + s * step) * fps))
            if i+6 >= len(flux): continue
            seg = flux[i-6:i+6, idxs].sum(1)
            g[s] += seg.max(); c[s] += 1
    g /= np.maximum(c, 1)
    return g / (g.mean() + 1e-9)
best = []
for ph in np.arange(0, bar, bar / 32):
    k = fold([0], ph); s = fold([1, 2], ph); h = fold([3, 4], ph)
    score = (k[0] + k[8] + s[4] + s[12]) / 4 - (k[[4, 12]].mean() + s[[0, 8]].mean()) / 2
    best.append((score, ph, k, s, h))
best.sort(key=lambda r: -r[0])
for score, ph, k, s, h in best[:3]:
    print('相位 %.3fs  score %+.2f' % (ph, score))
    print('  kick ', ' '.join('%+.2f' % (v - 1) for v in k))
    print('  snare', ' '.join('%+.2f' % (v - 1) for v in s))
    print('  hat  ', ' '.join('%+.2f' % (v - 1) for v in h))
