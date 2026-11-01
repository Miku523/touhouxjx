# -*- coding: utf-8 -*-
"""v1.6.70 立体声母版测量：逐段 RMS（mono 等效 = 每声道 +3.01）与频段。"""
import os, json, io, sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
KIT = os.path.join(ROOT, 'tools/build/_pret_kit')


def band_rel(x, sr, lo, hi):
    seg = x
    X = np.fft.rfft(seg * np.hanning(len(seg)))
    f = np.fft.rfftfreq(len(seg), 1.0 / sr)
    tot = float(np.sum(np.abs(X) ** 2))
    m = (f >= lo) & (f < hi)
    return 10 * np.log10(max(float(np.sum(np.abs(X[m]) ** 2)), 1e-12) / max(tot, 1e-12))


for n in ('pre1', 'pre2', 'pre3', 'pre4', 'pre6'):
    p = os.path.join(KIT, n + '_stereo.wav')
    x, sr = sf.read(p, always_2d=True)
    tot = x[:, 0] ** 2 + x[:, 1] ** 2
    secs = json.load(io.open(os.path.join(LEAD, n + '_secs.json'), encoding='utf-8'))['secs']
    print('==', n, '%.2fs' % (len(x) / sr), 'peak %.4f' % float(np.max(np.abs(x))))
    for tag, a, b in secs:
        i0, i1 = int(a * sr), min(len(x), int(b * sr))
        if i1 <= i0:
            continue
        pw = float(np.mean(tot[i0:i1]))
        rms_tot = 10 * np.log10(max(pw, 1e-12))
        mono_eq = 10 * np.log10(max(pw / 2.0, 1e-12))
        seg = x[i0:i1].mean(axis=1)
        print('   %-9s %6.2f-%6.2f  mono_eq %6.2f  63-125 %6.2f  hi4-12 %6.2f' % (
            tag, a, b, mono_eq, band_rel(seg, sr, 63, 125), band_rel(seg, sr, 4000, 12000)))
    s = x.mean(axis=1)
    print('   whole 63-125 %.2f  20-63 %.2f  125-250 %.2f  250-500 %.2f  1-2k %.2f  4-8k %.2f' % (
        band_rel(s, sr, 63, 125), band_rel(s, sr, 20, 63), band_rel(s, sr, 125, 250),
        band_rel(s, sr, 250, 500), band_rel(s, sr, 1000, 2000), band_rel(s, sr, 4000, 8000)))
