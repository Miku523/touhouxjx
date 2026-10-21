# -*- coding: utf-8 -*-
"""_ref7_prog.py —— 打印每小节和声进程 + 局部调性(每 16 小节) + 频谱，供人工判读。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))
NAMES = L5.NAMES


def local_key(bars, a, b):
    ch = np.mean([x['chroma'] for x in bars[a:b]], 0)
    bh = np.mean([x['bass_chroma'] for x in bars[a:b]], 0)
    cand = L5.key_of(ch)
    return [c[:3] for c in cand[:3]], ch, bh


for nm in (sys.argv[1:] or list(D)):
    d = D[nm]
    bars = d['bars']
    print('#' * 100)
    print('%s  bpm %.2f  bars %d  dur %.1f' % (nm, d['bpm'], len(bars), d['dur']))
    n = len(bars)
    for a in range(0, n, 16):
        b = min(n, a + 16)
        cand, ch, bh = local_key(bars, a, b)
        print('  -- bars %3d-%3d (%.1fs-%0.1fs) key=%s  chroma=%s' % (
            a, b, bars[a]['t0'], bars[b - 1]['t1'], cand,
            ' '.join('%s%.2f' % (NAMES[i], v) for i, v in enumerate(ch) if v > 0.06)))
    for x in bars:
        h = x['halves']
        s = '%4d %7.2f %-9s' % (x['i'], x['t0'], x['chord'] or '-')
        for q in h:
            s += ' |%6.2f %-7s' % (q['t'], q['chord'] or '-')
        s += ' bass=%s rms=%5.1f den=%.1f' % (x['bass_note'], 20 * np.log10(x['rms'] + 1e-9), x['density'])
        print(s)
