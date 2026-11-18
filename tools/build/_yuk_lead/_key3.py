# -*- coding: utf-8 -*-
import json, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
KS_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
KS_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def best_key(h):
    res = []
    for k in range(12):
        vmaj = sum(h[(k+i)%12] * KS_MAJ[i] for i in range(12))
        vmin = sum(h[(k+i)%12] * KS_MIN[i] for i in range(12))
        res.append((vmaj, PC[k]+' major')); res.append((vmin, PC[k]+' minor'))
    res.sort(reverse=True)
    return res[:3]
MEL = (0,1,3,6,10,11,12)
SECS = [(1,16),(17,32),(33,48),(49,80),(81,112),(113,116)]
for b0,b1 in SECS:
    h = {i:0.0 for i in range(12)}
    for n in notes:
        if b0 <= n['bar'] <= b1 and n['ch'] in MEL:
            h[n['m'] % 12] += n['d']
    tot = sum(h.values())
    print('%3d-%3d' % (b0,b1), ' '.join('%s:%.2f' % (PC[i], h[i]/tot) for i in range(12)))
    print('    ', ' | '.join('%s %.1f' % (k, v/max(1e-9,max(x for x,_ in best_key(h)))) for v,k in best_key(h)))
