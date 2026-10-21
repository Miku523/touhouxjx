# -*- coding: utf-8 -*-
"""_ref5_sections.py —— 每 8 小节一行的段落总表：时间、能量、白化和弦拟合、鼓密度、频段。
报告里的段落/和弦时间轴直接引用这里。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '_ref5_raw.json'), encoding='utf-8'))
NAMES = L.NAMES
CAND = [('i', 0, 'm'), ('ii°', 2, 'dim'), ('III', 3, ''), ('iv', 5, 'm'), ('v', 7, 'm'),
        ('V', 7, ''), ('VI', 8, ''), ('VII', 10, ''), ('IV', 5, ''), ('bII', 1, '')]
W = {0: 1.0, 3: 0.95, 4: 0.95, 7: 0.8, 10: 0.7, 6: 0.6, 5: 0.65, 8: 0.75, 9: 0.7}
F = 5


def fit(ch):
    ch = ch - ch.mean(); ch = np.maximum(ch, 0); ch = ch / (ch.sum() + 1e-9)
    sc = []
    for nm2, deg, q in CAND:
        tones = [(deg + (3 if q == 'm' else 6 if q == 'dim' else 4)) % 12,
                 (deg + (6 if q == 'dim' else 7)) % 12, deg % 12]
        inside = sum(ch[(F + t) % 12] * W.get(t, 0.5) for t in tones)
        outside = 1 - sum(ch[(F + t) % 12] for t in tones)
        sc.append((inside - 0.6 * outside, nm2, tones))
    sc.sort(reverse=True)
    return sc


sel = sys.argv[1:] or list(D)
for nm in sel:
    d = D[nm]
    bars = d['bars']
    db = np.array([20 * np.log10(b['rms'] + 1e-9) for b in bars])
    pk = db.max()
    print('=' * 104)
    print('%s dur %.1f bpm %.1f bars %d  bar %.3fs' % (nm, d['dur'], d['bpm'], len(bars), d['bar_sec']))
    for g in range(0, len(bars), 8):
        blk = bars[g:g + 8]
        ch = np.mean([b['chroma'] for b in blk], axis=0)
        sc = fit(ch)
        e = 20 * np.log10(np.mean([b['rms'] for b in blk]) + 1e-9) - pk
        k = np.mean([b['kick'] for b in blk]); s = np.mean([b['snare'] for b in blk])
        h = np.mean([b['hat'] for b in blk])
        lo = np.mean([b['low'] for b in blk]); md = np.mean([b['mid'] for b in blk])
        mh = np.mean([b['midh'] for b in blk]); hi = np.mean([b['high'] for b in blk])
        cen = np.mean([b['cen'] for b in blk])
        print('%3d-%3d %6.1f-%6.1fs %5.1fdB  %-6s(%s)  k%.1f s%.1f h%.1f  lo%.2f md%.2f mh%.2f hi%.2f cen%4.0f' % (
            g, g + len(blk) - 1, blk[0]['t0'], blk[-1]['t1'], e,
            sc[0][1], sc[1][1], k, s, h, lo, md, mh, hi, cen))
