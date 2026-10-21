# -*- coding: utf-8 -*-
"""mel / bp 的速度、调性、以及两版是不是同一首（帧余弦）"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L

D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
HOP = 4096.0 / 44100.0
def norm(A):
    return A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)

chms = {}
for tag, name in [('mel','sept_mel.mp3'), ('bp','sept_bp.mp3')]:
    x, sr = L.load_mono(os.path.join(D, name))
    seg = x[:int(56*sr)]
    _en, flux, fps, _bd = L.percussive(seg, sr)
    cands, conf = L.estimate_tempo(flux.sum(1), fps)
    (c, b), fpsc = L.chroma_frames(x, sr)
    chms[tag] = norm(c)
    print('%s 长度 %.1fs 速度 %s 置信 %.2f' % (tag, len(x)/sr, ' '.join('%.2f(%.2f)' % q for q in cands[:4]), conf))
    print('   调性:', ' | '.join('%s %s %.3f' % (n, m, r) for r, n, m, _ in L.key_of(c)[:3]))

A, B = chms['mel'], chms['bp']
best = None
for rot in range(12):
    Ar = np.roll(A, rot, axis=1)
    for shift in range(-200, 201, 2):
        n = min(len(Ar), len(B))
        lo = max(0, shift); hi = min(n, n + shift)
        if hi - lo < 60: continue
        sc = float((Ar[lo:hi] * B[lo-shift:hi-shift]).sum(1).mean())
        if best is None or sc > best[0]:
            best = (sc, shift, rot)
print('mel vs bp 帧余弦 %.3f shift %+.2fs 移调 %+d' % (best[0], best[1]*HOP, (best[2]+6)%12-6))