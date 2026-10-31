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
PC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def corr(a,b):
    n=12; ma=sum(a)/n; mb=sum(b)/n
    num=sum((a[i]-ma)*(b[i]-mb) for i in range(n))
    return num/((sum((x-ma)**2 for x in a)**.5)*(sum((x-mb)**2 for x in b)**.5))
def chroma(lo,hi):
    w=[0.0]*12
    for n in ns:
        if n['isDrum']: continue
        b=gbar(n['tickOn'])
        if lo<=b<=hi: w[n['pitch']%12]+=n['durSec']
    return w
def rank(w):
    res=[]
    for r in range(12):
        res.append((corr(w,[MIN[(i-r)%12] for i in range(12)]), PC[r]+'min'))
        res.append((corr(w,[MAJ[(i-r)%12] for i in range(12)]), PC[r]+'maj'))
    return ' | '.join('%s %.2f' % (k,c) for c,k in sorted(res, reverse=True)[:3])
for (a,z) in [(1,8),(9,24),(25,40),(41,48),(49,64),(65,81),(1,40),(41,81)]:
    print('bars %2d-%2d : %s' % (a,z, rank(chroma(a,z))))
# final melody notes
tail = sorted([n for n in ns if n['ch']==3 and gbar(n['tickOn'])>=79], key=lambda x:x['tickOn'])
print('last ch3 notes:', ' '.join('%s@b%d' % (M.pname(n['pitch']), gbar(n['tickOn'])) for n in tail[-10:]))
tail2 = sorted([n for n in ns if (not n['isDrum']) and gbar(n['tickOn'])>=80], key=lambda x:x['tickOn'])
print('bars80+ lowest/near-end:', ' '.join('%s@%d' % (M.pname(n['pitch']), gbar(n['tickOn'])) for n in tail2[-14:]))
print('max tickOff secs=%.2f' % max(n['secOff'] for n in ns))
