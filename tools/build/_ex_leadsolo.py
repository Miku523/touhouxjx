# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
a, _ = L.load_mono('tools/build/_tepes_full.wav')
b, _ = L.load_mono('tools/build/_tepes_nolead.wav')
n = min(len(a), len(b))
diff = a[:n] - b[:n]
print('lead alone rms %.4f' % np.sqrt(np.mean(diff**2)))
(chl, bl), fps = L.chroma_frames(diff, sr)
(chr_, br_), _ = L.chroma_frames(xr, sr)
off = int(round(57.44*fps)); win = int(round(fps*1.0)); m = min(len(chl), len(chr_)-off)
print('t      corr(shift0)  best shift')
for i in range(0, m-win, win):
    A = chr_[off+i:off+i+win].mean(0)
    B = chl[i:i+win].mean(0)
    if A.std() < 1e-6 or B.std() < 1e-6: continue
    best = (-9, 0)
    for s in range(12):
        r = np.corrcoef(A, np.roll(B, s))[0,1]
        if r > best[0]: best = (r, s)
    c0 = np.corrcoef(A, B)[0,1]
    print('%5.1f    %+.2f        %d (%+.2f)' % (i/fps, c0, best[1], best[0]))
