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
def gbeat(t): return ((t - SHIFT) % 1920) / 480.0 + 1.0
byb = defaultdict(list)
for n in ns: byb[gbar(n['tickOn'])].append(n)
def line(b, ch):
    sub = sorted([n for n in byb.get(b,[]) if n['ch']==ch], key=lambda x:(x['tickOn'], x['pitch']))
    return ' '.join('%s@%.2f' % (M.pname(n['pitch']), gbeat(n['tickOn'])) for n in sub)
for rng in [(24,32),(33,40),(41,48)]:
    print('=== ch3 / ch6 / ch7 bars %d-%d' % rng)
    for b in range(rng[0], rng[1]+1):
        print('b%2d L:%-58s 6:%-34s 7:%s' % (b, line(b,3)[:58], line(b,6)[:34], line(b,7)[:34]))
print('=== bars 49-56 ch14 organ / ch12 hi-str')
for b in range(49, 57):
    print('b%2d O:%-40s 12:%s' % (b, line(b,14)[:40], line(b,12)[:40]))
print('=== bars 65-72 ch3 lead')
for b in range(65, 73):
    print('b%2d L:%s' % (b, line(b,3)[:120]))
