# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
xm, _ = L.load_mono('tools/build/ex_tepes_v08.wav')
(chr_, br_), fps = L.chroma_frames(xr, sr)
(chm, bm), _ = L.chroma_frames(xm, sr)
off = int(round(57.44 * fps))
win = int(round(fps * 1.0))
n = min(len(chm), len(chr_) - off)
print('window  added PCs (mine 强于原曲 >=1.6x)')
for i in range(0, n - win, win):
    a = chr_[off+i:off+i+win].mean(0); a = a / (a.sum()+1e-9)
    b = chm[i:i+win].mean(0); b = b / (b.sum()+1e-9)
    add = [(PC[k], round(b[k]/max(a[k], 0.02),1)) for k in range(12) if b[k] > 0.10 and b[k]/max(a[k],0.02) >= 1.6]
    if add:
        print('%5.1f  %s' % (i/fps, ' '.join('%s×%.1f' % x for x in add)))
