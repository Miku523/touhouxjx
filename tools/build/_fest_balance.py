# -*- coding: utf-8 -*-
"""渲染各声部单独的干声，量一遍 RMS / 频段占比，看混音平衡对不对。"""
import json
import os

import numpy as np

import _make_festival_wav as F


def band_energy(y, sr, lo, hi):
    spec = np.abs(np.fft.rfft(y)) ** 2
    f = np.fft.rfftfreq(len(y), 1.0 / sr)
    m = (f >= lo) & (f < hi)
    return float(spec[m].sum())


def main():
    model = json.load(open(F.SRC_JSON, encoding='utf-8'))
    dur = float(model['duration'])
    tot = None
    rows = []
    for vname, notes in model['voices'].items():
        y, n = F.render({vname: notes}, dur)
        if tot is None:
            tot = np.zeros_like(y)
        tot += y
        rms = float(np.sqrt(np.mean(y * y)))
        rows.append((vname, n, 20 * np.log10(max(1e-9, rms)),
                     band_energy(y, F.SR, 40, 200), band_energy(y, F.SR, 200, 2000),
                     band_energy(y, F.SR, 2000, 9000)))
    rows.sort(key=lambda r: -r[2])
    base = rows[0][2]
    print('%-6s %5s %8s %7s  40-200  200-2k  2k-9k' % ('voice', 'note', 'rmsdB', 'rel'))
    for (v, n, db, b1, b2, b3) in rows:
        s = b1 + b2 + b3 + 1e-12
        print('%-6s %5d %8.1f %7.1f  %5.1f%% %6.1f%% %5.1f%%'
              % (v, n, db, db - base, 100 * b1 / s, 100 * b2 / s, 100 * b3 / s))
    rms = float(np.sqrt(np.mean(tot * tot)))
    print('mix rms %.1f dB（未归一）' % (20 * np.log10(max(1e-9, rms))))


if __name__ == '__main__':
    main()
