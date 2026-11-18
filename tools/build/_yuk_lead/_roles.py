# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
from collections import defaultdict, Counter
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/7 - Perfect Cherry Blossom'
m = M2.parse_midi(os.path.join(BASE, '18. Necrofantasia (ZUN).mid'))
progs = [(e[0], e[2], e[3]) for e in m['tracks'][0]['events'] if e[1] == 'prog']
print('prog changes:', progs)
D = json.load(open(os.path.join(HERE, 'midi_flat.json'), encoding='utf-8'))
notes = D['notes']
by = defaultdict(list)
for n in notes: by[n['ch']].append(n)
def sig(ch, lo=0, hi=1e9, k=16):
    return [(round(n['t'],2), n['m']) for n in by[ch] if lo <= n['t'] < hi][:k]
print('ch0 ', sig(0))
print('ch3 ', sig(3))
print('ch15', sig(15))
print('ch4 ', sig(4))
print('ch1 ', sig(1))
# 每 4 小节各候选通道音数
print('bars | ch0 ch1 ch3 ch6 ch7 ch10 ch11 ch12 | topmidi')
for b0 in range(1, 117, 4):
    b1 = b0 + 3
    cnt = {c: sum(1 for n in by[c] if b0 <= n['bar'] <= b1) for c in (0,1,3,6,7,10,11,12)}
    seg = [n for n in notes if b0 <= n['bar'] <= b1]
    top = max((n['m'] for n in seg), default=0)
    print('%3d-%3d | %s | %d' % (b0, b1, ' '.join('%3d' % cnt[c] for c in (0,1,3,6,7,10,11,12)), top))
