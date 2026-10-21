# -*- coding: utf-8 -*-
"""_ref6_probe_bass.py —— 低频中值谱细节 + 低频最强峰轨迹
用法: python _ref6_probe_bass.py ref1 25 33
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def nm(f):
    m = 69 + 12 * np.log2(max(f, 1e-6) / 440.0)
    return '%s%d' % (JP[int(round(m)) % 12], int(round(m)) // 12 - 1)


def med_spec(y, sr, t0, t1, n_fft=4096, hop=512):
    a = int(t0 * sr)
    b = min(len(y), int(t1 * sr))
    if b - a < n_fft:
        return None, None
    n = 1 + (b - a - n_fft) // hop
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    fr = y[idx] * np.hanning(n_fft)[None, :]
    return np.median(np.abs(np.fft.rfft(fr, axis=1)), axis=0), np.fft.rfftfreq(n_fft, 1.0 / sr)


def show_windows(path, wins):
    y, sr = L.load_mono(path, SR)
    for t0, t1 in wins:
        med, freqs = med_spec(y, sr, t0, t1)
        if med is None:
            continue
        m = (freqs >= 50) & (freqs <= 400)
        f, s = freqs[m], med[m]
        idx = [i for i in range(1, len(s) - 1) if s[i] > s[i - 1] and s[i] >= s[i + 1]]
        idx.sort(key=lambda i: -s[i])
        print('\n  window %.1f-%.1fs  low-band peaks:' % (t0, t1))
        base = s.max() + 1e-12
        for i in idx[:6]:
            print('     %6.1f Hz  %-4s  a=%.2f' % (f[i], nm(f[i]), s[i] / base))
    return y, sr


def bass_trace(path, t0, t1, lo=55, hi=250, step=0.25, n_fft=8192):
    y, sr = L.load_mono(path, SR)
    out = []
    t = t0
    while t < t1:
        a = int(t * sr)
        if a + n_fft > len(y):
            break
        seg = y[a:a + n_fft] * np.hanning(n_fft)
        sp = np.abs(np.fft.rfft(seg))
        fr = np.fft.rfftfreq(n_fft, 1.0 / sr)
        m = (fr >= lo) & (fr <= hi)
        i = int(np.argmax(sp * m))
        out.append((t, fr[i], sp[i]))
        t += step
    print('\n  bass trace %.1f-%.1fs (250ms):' % (t0, t1))
    line = []
    for t, f, a in out:
        line.append('%s' % nm(f))
    for i in range(0, len(line), 16):
        print('   %6.2fs ' % out[i][0] + ' '.join('%-4s' % x for x in line[i:i + 16]))


if __name__ == '__main__':
    tag = sys.argv[1] if len(sys.argv) > 1 else 'ref1'
    path = os.path.join(REF, tag + '.mp3')
    wins = [(0.2, 3.2), (25.3, 28.4), (28.4, 31.5), (94.9, 98.0)]
    show_windows(path, wins)
    t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 25.0
    t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 33.0
    bass_trace(path, t0, t1)
