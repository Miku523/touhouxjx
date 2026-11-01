# -*- coding: utf-8 -*-
"""逐段 RMS / 频段 / 逐 stem 电平 —— 五首道中共用。

用法:
  python _an2.py <name> <master.wav> [stemsdir]
    name = pre1|pre2|pre3|pre4|pre6  （读 <LEAD>/<name>_secs.json）
输出: 逐段 RMS(dBFS) + 低频(40-250) / 中频(300-3k) / 高频(4-12k) 相对能量 + 每 stem 逐段 RMS
"""
import sys, os, json, glob
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

LEAD = os.path.dirname(os.path.abspath(__file__))
name, master = sys.argv[1], sys.argv[2]
stems = sys.argv[3] if len(sys.argv) > 3 else None
SEC = json.load(open(os.path.join(LEAD, name + '_secs.json'), encoding='utf-8'))['secs']


def load_mono(p):
    x, sr = sf.read(p, always_2d=True)
    return x.mean(axis=1), sr


def rms_db(x):
    if len(x) == 0:
        return -99.0
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return 20 * np.log10(max(r, 1e-9))


def band_db(x, sr, lo, hi):
    if len(x) < 2048:
        return -99.0
    X = np.fft.rfft(x.astype(np.float64) * np.hanning(len(x)))
    f = np.fft.rfftfreq(len(x), 1.0 / sr)
    m = (f >= lo) & (f < hi)
    return 20 * np.log10(max(float(np.sqrt(np.sum(np.abs(X[m]) ** 2))), 1e-9))


x, sr = load_mono(master)
print('master %s  sr %d  dur %.3f' % (os.path.basename(master), sr, len(x) / sr))
print('%-10s %8s %8s %8s %8s' % ('section', 'RMS', 'low', 'mid', 'high'))
whole = rms_db(x)
tot = np.sqrt(np.mean(x.astype(np.float64) ** 2))
for nm, a, b in SEC:
    i0, i1 = int(a * sr), int(b * sr)
    seg = x[i0:i1]
    lo = band_db(seg, sr, 40, 250)
    mid = band_db(seg, sr, 300, 3000)
    hi = band_db(seg, sr, 4000, 12000)
    ref = 20 * np.log10(max(float(np.sqrt(np.mean(seg.astype(np.float64) ** 2))), 1e-9))
    print('%-10s %8.2f %8.1f %8.1f %8.1f' % (nm, ref, lo - ref, mid - ref, hi - ref))
print('whole RMS %.2f  peak %.4f' % (whole, float(np.max(np.abs(x)))))
if stems and os.path.isdir(stems):
    print('\n--- stems (per-section RMS) ---')
    names = [nm for nm, a, b in SEC]
    print('%-12s %s' % ('stem', ' '.join('%8s' % n[:8] for n in names)))
    for p in sorted(glob.glob(os.path.join(stems, '*.wav'))):
        nm = os.path.basename(p)[:-4]
        y, _ = load_mono(p)
        cells = []
        for sname, a, b in SEC:
            i0, i1 = int(a * sr), int(b * sr)
            cells.append('%8.1f' % rms_db(y[i0:i1]))
        print('%-12s %s' % (nm, ' '.join(cells)))
