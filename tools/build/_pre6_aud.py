# -*- coding: utf-8 -*-
# 从 refA 音频抓主旋律，和 MIDI ch3 顶声部对比
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'build'))
import midi2js as M
import _ref5_lib as L
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
nm = lambda m: NAMES[int(round(m)) % 12] + str(int(round(m)) // 12 - 1)

p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
x, sr = L.load_mono(p)
for lo, hi in ((500, 2000), (700, 3000)):
    mt, ms, fps = L.melody_track(x, sr, n_fft=4096, hop=512, lo=lo, hi=hi)
    # 每隔 0.1s 取一次
    idx = np.arange(0, len(mt), int(round(fps * 0.1)))
    seq = [(round(i / fps, 2), nm(mt[i]), round(float(ms[i]), 2)) for i in idx if not np.isnan(mt[i])][:36]
    print('band %d-%d:' % (lo, hi))
    print('  ', ' '.join('%s@%.1f' % (n, t) for t, n, s in seq))
