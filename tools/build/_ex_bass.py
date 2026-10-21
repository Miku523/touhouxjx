# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
xm, _ = L.load_mono('tools/build/ex_tepes_v08.wav')
(chr_, br_), fps = L.chroma_frames(xr, sr)
(chm, bm), _ = L.chroma_frames(xm, sr)
off = int(round(57.44 * fps)); win = int(round(fps*1.0)); n = min(len(chm), len(chr_)-off)
print('t      bass: 原曲  vs  我    (最简)')
for i in range(0, n-win, win*2):
    a = br_[off+i:off+i+win].mean(0); a /= a.sum()+1e-9
    b = bm[i:i+win].mean(0); b /= b.sum()+1e-9
    ta = [PC[k] for k in np.argsort(-a)[:2]]
    tb = [PC[k] for k in np.argsort(-b)[:2]]
    flag = '' if ta[0] == tb[0] else '  <<<'
    print('%5.1f  %-6s | %-6s%s' % (i/fps, '/'.join(ta), '/'.join(tb), flag))
