#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""逐段 RMS / dB 起伏对照：python tools/build/_pre6_dyn.py <wav> [循环点]"""
import sys
import numpy as np
import soundfile as sf

SECS = [('intro', 0.0, 10.37), ('A', 10.37, 34.07), ('B', 34.07, 44.44),
        ('C', 44.44, 53.33), ('D', 53.33, 62.22), ('E', 62.22, 77.082)]


def main():
    x, sr = sf.read(sys.argv[1], always_2d=False)
    if x.ndim > 1:
        x = x.mean(1)
    dur = len(x) / float(sr)
    print('%s  %.2fs  sr %d' % (sys.argv[1], dur, sr))
    print('峰 %.3f  RMS %.4f' % (np.max(np.abs(x)), np.sqrt(np.mean(x ** 2))))
    base = None
    for nm, t0, t1 in SECS:
        a, b = int(t0 * sr), min(int(t1 * sr), len(x))
        seg = x[a:b]
        r = float(np.sqrt(np.mean(seg ** 2)))
        if base is None:
            base = r
        db = 20 * np.log10(max(r, 1e-6) / max(base, 1e-6))
        print('%-6s %6.2f-%6.2f  RMS %.4f  %+.1f dB' % (nm, t0, t1, r, db))
    # 逐 8 小节（11.85s）看段内起伏
    print('--- 逐 8 小节 RMS')
    bar = 1.48148
    k = 0
    while k * 8 * bar < dur - 0.1:
        t0 = k * 8 * bar
        t1 = min(t0 + 8 * bar, dur)
        seg = x[int(t0 * sr):int(t1 * sr)]
        if len(seg):
            print('  %5.2f-%5.2f  %.4f' % (t0, t1, float(np.sqrt(np.mean(seg ** 2)))))
        k += 1
    if len(sys.argv) > 2:
        p = float(sys.argv[2])
        i = int(p * sr)
        print('循环点样本跳变 %.4f' % abs(float(x[i]) - float(x[i - 1]) if i else 0.0))


main()
