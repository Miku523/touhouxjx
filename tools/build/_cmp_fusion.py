# -*- coding: utf-8 -*-
"""对比三版：不抬调原调版(fb) / 融合版(mix) 的响度与分段"""

import os
import numpy as np
import soundfile as sf

BASE = r'C:\Users\GuSheng\Downloads\HKS\tools\build'
BAR = 240.0 / 154
for f in ('aya_fb_raw.wav', 'aya_mix_raw.wav'):
    a, sr = sf.read(os.path.join(BASE, f), always_2d=True)
    a = a[:, 0]
    print(f, 'peak %.3f rms %.4f' % (np.abs(a).max(), float(np.sqrt((a ** 2).mean()))))
    rows = []
    for k in range(7):
        t0 = int(k * 16 * BAR * sr)
        t1 = min(len(a), int((k + 1) * 16 * BAR * sr))
        seg = a[t0:t1]
        rows.append('%ds:%0.3f' % (int(k * 16 * BAR), float(np.sqrt((seg ** 2).mean()))))
    print('   ', '  '.join(rows))
