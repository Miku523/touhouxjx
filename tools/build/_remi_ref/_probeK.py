# -*- coding: utf-8 -*-
import sys, os
from collections import defaultdict
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
SHIFT=2360
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
def gbar(t): return int((t - SHIFT) // 1920) + 1
byb = defaultdict(list)
for n in ns: byb[gbar(n['tickOn'])].append(n)
PC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
def pcw(b):
    w = [0.0]*12
    for n in byb.get(b,[]):
        if n['isDrum']: continue
        dur = min(n['durSec'], 1.2)
        w[n['pitch']%12] += dur
    return w
def bass(b):
    sub = [n for n in byb.get(b,[]) if n['ch']==1]
    if not sub:
        sub = [n for n in byb.get(b,[]) if n['ch']==13]
    sub.sort(key=lambda x:x['pitch'])
    return sub[0]['pitch'] if sub else None
for b in range(1, 82):
    w = pcw(b); tot = sum(w) or 1
    tops = sorted(range(12), key=lambda i:-w[i])[:5]
    bn = bass(b)
    root = bn % 12 if bn is not None else tops[0]
    w3, w4 = w[(root+3)%12], w[(root+4)%12]
    q = 'm' if w3 > w4 else ('' if w4 > w3 else '5')
    line = 'b%2d root=%-3s q=%-2s bass=%-4s tops=%s' % (b, PC[root], q, (M.pname(bn) if bn else '-'),
        ' '.join('%s%.0f' % (PC[i], 100*w[i]/tot) for i in tops))
    print(line)
