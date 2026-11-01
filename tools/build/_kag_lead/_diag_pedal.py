# -*- coding: utf-8 -*-
import os, json, io, collections
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(io.open(os.path.join(HERE, 'song.json'), encoding='utf-8'))
tr = {t['name']: t['notes'] for t in S['tracks']}
ped = [n for n in tr['sub'] if n[3] == 36]
print('pedal sub notes vel36:', len(ped), 'pitches', sorted(collections.Counter(n[1] for n in ped).items()))
inband = [n for n in ped if 36 <= n[1] <= 47]
print('in band 36-47:', len(inband), 'durations min/max', min(n[2] for n in inband), max(n[2] for n in inband))
low = [n for n in ped if n[1] < 36]
print('below band:', len(low), sorted(collections.Counter(n[1] for n in low).items()))
print()
print('sub notes by vel:', sorted(collections.Counter(n[3] for n in tr['sub']).items()))
