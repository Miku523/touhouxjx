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
    return ' '.join('%s' % M.pname(n['pitch']) for n in sub)
for b in list(range(41,53)):
    print('b%2d ch1:%-100s' % (b, line(b,1)[:100]))
print('--- ch2 piano RH bars 1-8 (intro motif)')
def line2(b, ch):
    sub = sorted([n for n in byb.get(b,[]) if n['ch']==ch], key=lambda x:(x['tickOn'], x['pitch']))
    return ' '.join('%s@%.2f' % (M.pname(n['pitch']), gbeat(n['tickOn'])) for n in sub)
for b in range(1,9):
    print('b%2d ch2:%-70s ch13:%s' % (b, line2(b,2)[:70], line2(b,13)[:60]))
