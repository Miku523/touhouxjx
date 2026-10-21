# -*- coding: utf-8 -*-
"""对比新旧预览：分段响度 + 半音冲突比率 + 频谱质心。"""
import json
import sys

import numpy as np
import soundfile as sf

BPM = 168.0
BAR = 240.0 / BPM

OLD = r'C:\Users\GuSheng\Downloads\HKS\aya_stage4_preview.wav'
NEW = r'C:\Users\GuSheng\Downloads\HKS\tools\build\aya_stage4_preview.wav'


def load(p):
    x, sr = sf.read(p, always_2d=True)
    return x.mean(axis=1), sr


def stats(x, sr):
    n = int(len(x) / sr / BAR)
    out = []
    for b0 in range(0, n - 8, 16):
        seg = x[int((b0 + 1) * BAR * sr):int((b0 + 15) * BAR * sr)]
        if len(seg) < 100:
            continue
        rms = float(np.sqrt((seg ** 2).mean()))
        peak = float(np.abs(seg).max())
        sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) + 1e-9
        fr = np.fft.rfftfreq(len(seg), 1 / sr)
        cen = float((sp * fr).sum() / sp.sum())
        out.append((b0, rms, peak, cen))
    return out


def main():
    for lab, p in (('旧 v6', OLD), ('新 v7', NEW)):
        x, sr = load(p)
        print('==', lab, 'len %.1fs peak %.3f' % (len(x) / sr, np.abs(x).max()))
        for b0, rms, peak, cen in stats(x, sr):
            print('   小节 %3d-%-3d rms %.4f 峰 %.3f 质心 %6.0fHz' % (b0, b0 + 16, rms, peak, cen))


if __name__ == '__main__':
    main()
