# -*- coding: utf-8 -*-
"""逐段 RMS + 逐 stem 逐段 RMS。用法: python _an.py <master.wav> <stemsdir>"""
import sys, os, json, glob
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']

def rms_db(x):
    if len(x) == 0: return -99.0
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return 20 * np.log10(max(r, 1e-9))

def load(p):
    x, sr = sf.read(p, always_2d=True)
    return x.mean(axis=1), sr

def seg_report(path, sr, tag):
    x, _ = load(path)
    out = []
    for name, a, b in SEC:
        i0, i1 = int(a * sr), int(b * sr)
        out.append((name, rms_db(x[i0:i1])))
    print('%-14s %s' % (tag, '  '.join('%s %.2f' % (n, v) for n, v in out)))
    return out

master = sys.argv[1]
sr = sf.info(master).samplerate
print('master', os.path.basename(master), 'sr', sr)
seg_report(master, sr, 'MASTER')
stems = sys.argv[2]
for p in sorted(glob.glob(os.path.join(stems, '*.wav'))):
    name = os.path.basename(p)[:-4]
    if name.startswith('90_'):
        continue
    seg_report(p, sr, name)
