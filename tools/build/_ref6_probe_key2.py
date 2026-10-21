# -*- coding: utf-8 -*-
"""_ref6_probe_key2.py —— 主旋律音级直方图（时长加权）+ 和声色度(160-650Hz)明细
用法: python _ref6_probe_key2.py ref1 [tuning]
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


def mel_hist(y, sr, tuning=0.0, n_fft=8192, hop=735, fmin=600, fmax=2100):
    n = 1 + (len(y) - n_fft) // hop
    hist = np.zeros(12)
    mags = []
    recs = []
    win = np.hanning(n_fft)
    for b0 in range(0, n, 400):
        b1 = min(n, b0 + 400)
        idx = np.arange(b0, b1)[:, None] * hop + np.arange(n_fft)[None, :]
        fr = y[idx] * win
        mag = np.abs(np.fft.rfft(fr, axis=1))
        freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
        m = (freqs >= fmin) & (freqs <= fmax)
        sub = mag[:, m]
        ii = np.argmax(sub, axis=1)
        for k in range(len(ii)):
            midi = 69 + 12 * np.log2(freqs[m][ii[k]] / 440.0) - tuning / 100.0
            recs.append((int(round(midi)) % 12, float(sub[k, ii[k]])))
    recs = np.array([(p, a) for p, a in recs])
    if len(recs) == 0:
        return np.zeros(12), 0
    thr = np.percentile(recs[:, 1], 55)
    sel = recs[recs[:, 1] >= thr]
    for p in range(12):
        hist[p] = float((sel[:, 0] == p).sum())
    return hist / (hist.sum() + 1e-9), len(sel)


def harm_chroma(y, sr, t0, t1, tuning=0.0, lo=160.0, hi=650.0, n_fft=4096, hop=512):
    a = int(t0 * sr)
    b = min(len(y), int(t1 * sr))
    n = 1 + (b - a - n_fft) // hop
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    fr = y[idx] * np.hanning(n_fft)[None, :]
    med = np.median(np.abs(np.fft.rfft(fr, axis=1)), axis=0)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    m = (freqs >= lo) & (freqs <= hi)
    f = freqs[m]
    midi = 69 + 12 * np.log2(f / 440.0) - tuning / 100.0
    pc = np.mod(np.round(midi).astype(int), 12)
    keep = np.abs(midi - np.round(midi)) < 0.5
    v = np.zeros(12)
    for p in range(12):
        g = keep & (pc == p)
        if g.any():
            v[p] = float((med[m][g] ** 0.7).sum())
    return v / (v.sum() + 1e-9), med, freqs


WINS = [(0.3, 3.4), (3.4, 6.5), (6.5, 9.6), (9.6, 12.7), (12.8, 15.9),
        (25.4, 28.5), (28.5, 31.6), (31.6, 34.7), (95.0, 98.1), (98.1, 101.2),
        (133.0, 136.1), (145.0, 148.1)]

if __name__ == '__main__':
    tag = sys.argv[1] if len(sys.argv) > 1 else 'ref1'
    tuning = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
    h, nsel = mel_hist(y, sr, tuning)
    print('\n%s 主旋律音级直方图 (时长加权, %d 帧):' % (tag, nsel))
    for i in np.argsort(-h):
        print('   %-3s %.3f  %s' % (JP[i], h[i], '#' * int(round(h[i] * 60))))
    print('\n和声色度明细 (160-650Hz 中值谱, 音符强度前 6):')
    for t0, t1 in WINS:
        v, med, freqs = harm_chroma(y, sr, t0, t1, tuning)
        top = ' '.join('%s:%.2f' % (JP[i], v[i]) for i in np.argsort(-v)[:6])
        print('  %5.1f-%5.1fs  %s' % (t0, t1, top))
