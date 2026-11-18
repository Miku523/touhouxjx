# -*- coding: utf-8 -*-
import json, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def barinfo(b):
    seg = [n for n in notes if n['bar']==b]
    bass = [n for n in seg if n['ch']==2]
    root = min(bass, key=lambda n:n['m'])['m'] if bass else None
    # melody: 最高音且时值>=0.2
    mel = [n for n in seg if n['ch'] in (0,1,3,6,10,11,12)]
    top = max(mel, key=lambda n:(n['m'], n['t']))['m'] if mel else None
    return (PC[root%12] if root else '-'), (PC[top%12] if top else '-'), (top or 0)
for b0 in list(range(1,49,4)) + list(range(49,117,4)):
    row = [barinfo(b) for b in range(b0, b0+4)]
    print('%3d: ' % b0 + '  '.join('%s/%s' % (r[0], r[1]) for r in row))
