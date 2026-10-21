# -*- coding: utf-8 -*-
"""_ref5_prog.py —— 把每 4 小节色谱吸附到 F 自然小调（及常见借用）的和弦模板上，
输出级数进行 + 置信度，供报告直接引用。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '_ref5_raw.json'), encoding='utf-8'))
F = 5  # F 的 pitch class
SCALE = [0, 2, 3, 5, 7, 8, 10]  # 自然小调
# 候选和弦：自然小调 diatonic + 常见借用（V 大、IV 大、bII、bVII）
CAND = [('i', 0, 'm'), ('ii°', 2, 'dim'), ('III', 3, ''), ('iv', 5, 'm'),
        ('v', 7, 'm'), ('V', 7, ''), ('VI', 8, ''), ('VII', 10, ''),
        ('IV', 5, ''), ('bII', 1, '')]
W = {0: 1.0, 3: 0.95, 4: 0.95, 7: 0.8, 10: 0.7, 6: 0.6, 5: 0.65, 8: 0.75, 9: 0.7}

sel = sys.argv[1:] or list(D)
for nm in sel:
    d = D[nm]
    bars = d['bars']
    print('=' * 90)
    print('%s  bpm %.1f  bar %.3f  nbars %d' % (nm, d['bpm'], d['bar_sec'], len(bars)))
    out = []
    for g in range(0, len(bars), 4):
        blk = bars[g:g + 4]
        if not blk:
            break
        ch = np.mean([b['chroma'] for b in blk], axis=0)
        ch = ch / (ch.sum() + 1e-9)
        bass = np.zeros(12)
        for b in blk:
            if b['bass_pc'] >= 0:
                bass[b['bass_pc']] += 1
        bass = bass / (bass.sum() + 1e-9)
        sc = []
        for nm2, deg, q in CAND:
            tones = [deg, deg + (3 if q == 'm' else 4), deg + (6 if q == 'dim' else 7)]
            tones = [t % 12 for t in tones]
            inside = sum(ch[(F + t) % 12] * W.get(t, 0.5) for t in tones)
            outside = 1 - sum(ch[(F + t) % 12] for t in tones)
            sc.append((inside - 0.5 * outside + 1.0 * bass[deg % 12], nm2))
        sc.sort(reverse=True)
        out.append((blk[0]['t0'], sc[0][1], round(sc[0][0], 3), sc[1][1],
                    round(sc[0][0] - sc[1][0], 3)))
    line = ''
    for i, (t0, c1, s1, c2, m) in enumerate(out):
        line += ('%d:%s%s' % (i, c1, '"' if m < 0.06 else ''))
        if (i + 1) % 8 == 0:
            print('  t%6.1fs  %s' % (out[i - 7][0], line)); line = ''
    if line:
        print('  t%6.1fs  %s' % (out[len(out) - len(line.split())]['t0'], line))
