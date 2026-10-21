# -*- coding: utf-8 -*-
"""_ref5_curate.py —— 把 _ref5_raw.json 压成便于人工判读的段落/和弦表。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '_ref5_raw.json'), encoding='utf-8'))
sel = sys.argv[1:] or list(D)
GRP = 4

for nm in sel:
    d = D[nm]
    bars = d['bars']
    rms = np.array([b['rms'] for b in bars])
    db = 20 * np.log10(rms + 1e-9)
    pk = db.max()
    print('=' * 100)
    print('%s  dur %.1fs  bpm %.1f  调性前3 %s' % (nm, d['dur'], d['bpm'],
          [(round(r, 2), n, m) for r, n, m, _ in d['key'][:3]]))
    print('低音直方', [(L.NAMES[i], round(float(v), 2)) for i, v in
                     sorted(enumerate(d['bass_hist']), key=lambda x: -x[1])[:5]])
    print('四踩 %.2f  kick%s snare%s' % (d['four_on_floor'], d['beat_energy']['kick'],
                                        d['beat_energy']['snare']))
    print('旋律', d['melody'])
    print('-- 能量 dB(峰值0) 简图 --')
    line = ''
    for i in range(0, len(bars), 1):
        v = db[i] - pk
        line += ' .:-=+*#%@'[min(9, max(0, int((v + 24) / 2.7)))]
    for i in range(0, len(line), 100):
        print(' bar%3d %s' % (i, line[i:i + 100]))
    print('-- 4小节块：t0 能量dB 和弦(置信) bass 鼓k/s/h --')
    for g in range(0, len(bars), GRP):
        blk = bars[g:g + GRP]
        if not blk:
            break
        t0 = blk[0]['t0']; e = float(np.mean([b['rms'] for b in blk]))
        chs = [b['chord'] for b in blk]
        mids = [b['chord_margin'] for b in blk]
        bassp = [b['bass_pc'] for b in blk]
        k = int(np.mean([b['kick'] for b in blk])); s = int(np.mean([b['snare'] for b in blk]))
        h = int(np.mean([b['hat'] for b in blk]))
        print('%3d-%3d %6.2fs %5.1fdB %-30s m%.2f bass %-14s k%-2d s%-2d h%-2d' % (
            g, g + len(blk) - 1, t0, 20 * np.log10(e + 1e-9) - pk,
            '|'.join(chs), float(np.mean(mids)),
            '/'.join(sorted({L.NAMES[p] for p in bassp if p >= 0})), k, s, h))
    print('novelty 峰（bar/秒）:', [(p, round(d['bars'][p][0] if False else d['bars'][p]['t0'], 1))
                              for p, _ in d['novelty_peaks'][:16]])
