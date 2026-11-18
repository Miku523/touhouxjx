# -*- coding: utf-8 -*-
import json, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MEL = (0,1,3,6,10,11,12)
SECS = [(1,16),(17,32),(33,48),(49,80),(81,112),(113,116)]
for b0, b1 in SECS:
    seg = [n for n in notes if b0 <= n['bar'] <= b1 and n['ch'] in MEL]
    h = Counter(n['m'] % 12 for n in seg)
    tot = sum(h.values()) or 1
    top = sorted(h.items(), key=lambda kv:-kv[1])[:8]
    print('%3d-%3d n=%4d | %s' % (b0,b1,len(seg), ' '.join('%s:%.0f%%' % (PC[k], 100.0*v/tot) for k,v in top)))
    # 最低根音（每小节第一个音）粗略和弦
    roots = Counter()
    for b in range(b0, b1+1):
        bn = [n for n in notes if n['bar']==b and n['ch']==2]
        if bn:
            roots[min(bn, key=lambda n:n['m'])['m'] % 12] += 1
    print('     bass roots:', ' '.join('%s%d' % (PC[k],v) for k,v in roots.most_common(6)))
