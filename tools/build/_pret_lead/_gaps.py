# -*- coding: utf-8 -*-
import wave, os, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for n in ('pre1','pre2','pre3','pre4','pre6'):
    p = os.path.join(ROOT, 'tools/build/_pret_kit/%s_stereo.wav' % n)
    with wave.open(p) as w:
        sr = w.getframerate(); nf = w.getnframes()
        x = np.frombuffer(w.readframes(nf), dtype='<i2').astype(np.float64).reshape(-1, 2).mean(axis=1) / 32768.0
    win = int(0.1 * sr)
    e = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))[::win]
    db = 20 * np.log10(np.maximum(e, 1e-9))
    low = db < -42
    # 连续低能量块
    gaps = []
    i = 0
    while i < len(low):
        if low[i]:
            j = i
            while j < len(low) and low[j]:
                j += 1
            if (j - i) * 0.1 >= 0.4:
                gaps.append((round(i * 0.1, 2), round((j - i) * 0.1, 2)))
            i = j
        else:
            i += 1
    print(n, 'dur', round(len(x) / sr, 2), 'min db', round(db.min(), 1), 'gaps', gaps[:8], 'count', len(gaps))
