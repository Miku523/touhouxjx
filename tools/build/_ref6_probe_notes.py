# -*- coding: utf-8 -*-
"""_ref6_probe_notes.py —— 25ms 级主旋律音高轨迹（只看 600-2000Hz 最强谱峰）
用法: python _ref6_probe_notes.py ref1 24 34
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


def trace(path, t0, t1, fmin=550, fmax=2100, step=0.05, n_fft=8192):
    y, sr = L.load_mono(path, SR)
    hop = int(step * sr)
    out = []
    t = t0
    while t < t1:
        a = int(t * sr)
        if a + n_fft > len(y):
            break
        seg = y[a:a + n_fft] * np.hanning(n_fft)
        sp = np.abs(np.fft.rfft(seg))
        fr = np.fft.rfftfreq(n_fft, 1.0 / sr)
        m = (fr >= fmin) & (fr <= fmax)
        i = int(np.argmax(sp * m))
        if sp[i] <= 1e-6:
            out.append(None)
        else:
            midi = 69 + 12 * np.log2(fr[i] / 440.0)
            out.append(round(midi, 2))
        t += step
    return out, step


def render(seq, step, t0):
    """把 MIDI(浮点) 序列画成一行行文本：每行 40 格 = 2s"""
    line = []
    for k, m in enumerate(seq):
        if m is None:
            line.append('.')
            continue
        pc = int(round(m)) % 12
        octv = int(round(m)) // 12 - 1
        line.append('%s%d' % (JP[pc], octv))
    w = 14
    for i in range(0, len(line), w):
        print('  %6.2fs  %s' % (t0 + i * step, ' '.join('%-3s' % x for x in line[i:i + w])))


if __name__ == '__main__':
    tag = sys.argv[1] if len(sys.argv) > 1 else 'ref1'
    t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 25.0
    t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 33.0
    seq, step = trace(os.path.join(REF, tag + '.mp3'), t0, t1)
    print('%s melody trace %.1f-%.1f (50ms/格)' % (tag, t0, t1))
    render(seq, step, t0)
