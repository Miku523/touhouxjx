# -*- coding: utf-8 -*-
"""_ref7_key.py —— 用旋律音高分布 + 低音分布复核调性。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
D = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))
NAMES = L5.NAMES

for nm in (sys.argv[1:] or list(D)):
    d = D[nm]
    x, sr = L5.load_mono(os.path.join(SRC, nm + '.mp3'))
    mt, ms, mfps = L5.melody_track(x, sr)
    ok = ms > 0.02
    pcs = np.round(mt[ok]).astype(int) % 12
    w = ms[ok]
    hist = np.zeros(12)
    for p, ww in zip(pcs, w):
        hist[p] += ww
    hist = np.round(hist / hist.sum(), 3)
    order = np.argsort(-hist)[:7]
    print('=' * 90)
    print('%s  melody notes=%d  melody chroma: %s' % (nm, ok.sum(),
          ' '.join('%s=%.3f' % (NAMES[i], hist[i]) for i in range(12))))
    print('   前 7: %s' % ' '.join('%s=%.3f' % (NAMES[i], hist[i]) for i in order))
    cand = L5.key_of(hist)
    print('   旋律 KS: %s' % [c[:3] for c in cand[:5]])
    # 八度分布（核对旋律提取是否被伴奏污染）
    oct_ = np.floor(mt[ok] / 12).astype(int)
    vals, cnts = np.unique(oct_, return_counts=True)
    print('   八度分布: %s' % dict(zip([int(v) for v in vals], [int(c) for c in cnts])))
