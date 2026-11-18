# -*- coding: utf-8 -*-
import json, os
from collections import defaultdict, Counter
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
NB = max(n['bar'] for n in notes)
STEP = 8
print('bars', NB, ' dur', round(D['bar_len'] * NB, 2))
# 矩阵
print('bar-range  ' + '  '.join('ch%02d' % c for c in range(16)))
for b0 in range(1, NB + 1, STEP):
    b1 = b0 + STEP - 1
    row = []
    for c in range(16):
        cnt = sum(1 for n in notes if b0 <= n['bar'] <= b1 and n['ch'] == c)
        row.append('%4d' % cnt if cnt else '   .')
    print('%3d-%3d  %s' % (b0, b1, ' '.join(row)))
# 音级
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
hist = Counter(n['m'] % 12 for n in notes)
print('pitch classes:', ', '.join('%s:%d' % (PC[k], hist[k]) for k in sorted(hist, key=lambda k:-hist[k])))
# 每通道样本
for c in [0,1,2,3,4,5,6,7,8,10,11,12,15]:
    ns = [n for n in notes if n['ch'] == c][:10]
    print('ch%02d' % c, [(n['bar'], n['beat'], n['m'], n['d']) for n in ns])
