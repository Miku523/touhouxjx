# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L

xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
xm, _ = L.load_mono('tools/build/ex_tepes_v08.wav')
(chr_, br_), fps = L.chroma_frames(xr, sr)
(chm, bm), _ = L.chroma_frames(xm, sr)
off = int(round(57.44 * fps))
n = min(len(chm), len(chr_) - off)
print('fps %.1f frames %d off %d' % (fps, n, off))
win = int(fps * 2)
rows = []
for i in range(0, n - win, win):
    a = chr_[off+i:off+i+win].mean(0)
    b = chm[i:i+win].mean(0)
    best = (-9, 0)
    for s in range(12):
        bs = np.roll(b, s)
        r = np.corrcoef(a, bs)[0,1]
        if r > best[0]: best = (r, s)
    rows.append((i/fps, best[0], best[1]))
for t, r, s in rows:
    print('%5.1f  corr %.2f  shift %d' % (t, r, s))
