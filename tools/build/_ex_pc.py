# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

def chroma_pc(path):
    x, sr = L.load_mono(path)
    (ch, b), fps = L.chroma_frames(x, sr)
    h = ch.sum(0); h = h / h.sum()
    bh = b.sum(0); bh = bh / (bh.sum() + 1e-9)
    return h, bh

for label, p in [('ORIG', r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3'), ('MINE', 'tools/build/ex_tepes_v08.wav')]:
    h, bh = chroma_pc(p)
    print(label, 'harmonic:', ' '.join('%s%.2f' % (PC[i], h[i]) for i in np.argsort(-h)[:9]))
    print(label, 'bass    :', ' '.join('%s%.2f' % (PC[i], bh[i]) for i in np.argsort(-bh)[:6]))
