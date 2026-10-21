# -*- coding: utf-8 -*-
# 版 2：先用 HPSS 取打击乐，再按 16 分格统计 kick / snare / hat
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'build'))
import _ref5_lib as L
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
x, sr = L.load_mono(p)
print('percussive() 返回:', end=' ')
perc = L.percussive(x, sr)
print(type(perc), getattr(perc, 'shape', None))
hp = perc[1] if isinstance(perc, tuple) else perc
if isinstance(perc, tuple):
    print('tuple lens:', [np.shape(v) for v in perc])
