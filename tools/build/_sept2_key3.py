# -*- coding: utf-8 -*-
"""只用旋律频段(500-1600Hz)的色谱定调：原曲 vs 蓝图"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L
D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
for tag, name in [('mel','sept_mel.mp3'), ('bp','sept_bp.mp3')]:
    x, sr = L.load_mono(os.path.join(D, name))
    for hr in [(500,1600),(300,1200)]:
        (c, b), _ = L.chroma_frames(x, sr, hrange=hr)
        ks = L.key_of(c)[:4]
        print('%s %s: %s' % (tag, hr, ' | '.join('%s%s %.2f' % (n, m, r) for r, n, m, _ in ks)))
