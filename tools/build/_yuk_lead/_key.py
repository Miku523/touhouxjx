# -*- coding: utf-8 -*-
import json, os
from collections import defaultdict, Counter
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
by = defaultdict(list)
for n in notes: by[n['ch']].append(n)
MEL = (0,1,3,6,10,11,12)
for b0 in range(1, 117, 4):
    b1 = b0 + 3
    seg = [n for n in notes if b0 <= n['bar'] <= b1]
    cnt = {c: sum(1 for n in seg if n['ch']==c) for c in MEL}
    # melody = channel with most notes among melody candidates, preferring long durations
    best = max(MEL, key=lambda c: (sum(n['d'] for n in seg if n['ch']==c), cnt[c]))
    mel = [n for n in seg if n['ch']==best]
    top = sorted(mel, key=lambda n:-n['m'])[:5]
    bass = [n for n in seg if n['ch']==2]
    broot = Counter(n['m'] % 12 for n in bass).most_common(3)
    kv = Counter(n['m'] % 12 for n in seg).most_common(4)
    print('%3d-%3d mel=ch%02d %s | bass %s | pcs %s' % (
        b0, b1, best,
        ' '.join('%s%d@%.1f' % (PC[n['m']%12], n['m'], n['beat']) for n in top[:3]),
        ' '.join('%s%d' % (PC[r],c) for r,c in broot),
        ' '.join('%s%d' % (PC[r],c) for r,c in kv)))
