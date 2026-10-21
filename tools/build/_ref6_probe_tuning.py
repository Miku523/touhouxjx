# -*- coding: utf-8 -*-
"""_ref6_probe_tuning.py —— 检测录音整体调音偏差 & 每个八度的能量，验证色度是否被调音搞糊"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

REFS = [('ref1', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref1.mp3'),
        ('ref3', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref3.mp3'),
        ('ref5', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref5.mp3')]
SR = 22050


def mean_spec(y, sr, n_fft=4096, hop=2048):
    frames = L.sliding_frames(y, n_fft, hop)
    w = np.hanning(n_fft).astype(np.float32)
    acc = np.zeros(n_fft // 2 + 1)
    cnt = 0
    for b0 in range(0, len(frames), 256):
        fr = np.asarray(frames[b0:b0 + 256], dtype=np.float32) * w
        m = np.abs(np.fft.rfft(fr, axis=1))
        acc += m.sum(axis=0)
        cnt += len(fr)
    return acc / max(cnt, 1), np.fft.rfftfreq(n_fft, 1.0 / sr)


def tuning_score(spec, freqs, cents, f_lo=60.0, f_hi=3000.0):
    sel = (freqs >= f_lo) & (freqs <= f_hi)
    f = freqs[sel]
    a = spec[sel]
    a = a / (a.sum() + 1e-12)
    midi = 69.0 + 12.0 * np.log2(f / 440.0) - cents / 100.0
    dev = np.abs(midi - np.round(midi))
    w = np.exp(-(dev ** 2) / (2 * 0.09 ** 2))
    return float((a * w).sum())


def main():
    for tag, path in REFS:
        y, sr = L.load_mono(path, SR)
        spec, freqs = mean_spec(y, sr)
        best = (-1, 0)
        curve = []
        for c in np.arange(-50, 50.1, 1.0):
            s = tuning_score(spec, freqs, c)
            curve.append((c, s))
            if s > best[0]:
                best = (s, c)
        print('=' * 60)
        print(tag, 'best tuning: %+.1f cents (score %.5f)' % (best[1], best[0]))
        print('  curve every 10 cents:', [(round(c), round(s, 5)) for c, s in curve[::10]])
        # 八度能量分布
        for lo, hi in ((60, 120), (120, 250), (250, 500), (500, 1000),
                       (1000, 2000), (2000, 4000), (4000, 8000)):
            m = (freqs >= lo) & (freqs < hi)
            print('   %5d-%5d Hz  %.4f' % (lo, hi, spec[m].sum() / spec.sum()))


if __name__ == '__main__':
    main()
