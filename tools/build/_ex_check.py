# -*- coding: utf-8 -*-
"""试听渲染结果的客观体检：峰值/RMS 走向/频段平衡/削波。"""
import sys

import numpy as np
import soundfile as sf

for path in sys.argv[1:]:
    y, sr = sf.read(path, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    n = len(y)
    peak = float(np.max(np.abs(y)))
    clip = int(np.sum(np.abs(y) >= 0.999))
    print('=' * 74)
    print('%s  %.1fs @%dHz  peak=%.3f (%.1fdBFS)  clip=%d  RMS=%.1fdBFS'
          % (path, n / sr, sr, peak, 20 * np.log10(max(peak, 1e-9)), clip,
             20 * np.log10(max(np.sqrt(np.mean(y ** 2)), 1e-9))))
    # 每 8 秒块：RMS / 频谱重心 / 低频占比
    blk = int(8 * sr)
    print('  %6s %8s %8s %7s %7s %7s' % ('时间', 'RMSdB', '重心Hz', '<200', '200-2k', '>2k'))
    for i in range(0, n, blk):
        c = y[i:i + blk]
        if len(c) < sr:
            break
        rms = float(np.sqrt(np.mean(c ** 2)))
        if rms < 1e-6:
            continue
        sp = np.abs(np.fft.rfft(c * np.hanning(len(c))))
        f = np.fft.rfftfreq(len(c), 1 / sr)
        p = sp ** 2
        cen = float(np.sum(f * p) / max(np.sum(p), 1e-12))
        lo = float(np.sum(p[(f >= 20) & (f < 200)]) / max(np.sum(p), 1e-12))
        mid = float(np.sum(p[(f >= 200) & (f < 2000)]) / max(np.sum(p), 1e-12))
        hi = float(np.sum(p[(f >= 2000) & (f < 12000)]) / max(np.sum(p), 1e-12))
        print('  %5.0fs %8.1f %8.0f %6.0f%% %6.0f%% %6.0f%%'
              % (i / sr, 20 * np.log10(max(rms, 1e-9)), cen, lo * 100, mid * 100, hi * 100))
