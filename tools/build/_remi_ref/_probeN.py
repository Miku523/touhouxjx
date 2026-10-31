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
def chroma(sel):
    w = [0.0]*12
    for n in ns:
        if n['isDrum'] or not sel(n): continue
        w[n['pitch']%12] += n['durSec']
    return w
def top3(w):
    t = sorted(range(12), key=lambda i:-w[i])[:3]
    return ' '.join('%s%.0f' % (PC[i], 100*w[i]/(sum(w) or 1)) for i in t)
print('bass ch1  :', top3(chroma(lambda n: n['ch']==1)))
print('ch13 low  :', top3(chroma(lambda n: n['ch']==13 and n['pitch']<48)))
print('ch13 all  :', top3(chroma(lambda n: n['ch']==13)))
print('all pitch :', top3(chroma(lambda n: True)))
print('melody ch3:', top3(chroma(lambda n: n['ch']==3)))
# Krumhansl-Schmuckler
MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def corr(a,b):
    n=12; ma=sum(a)/n; mb=sum(b)/n
    num=sum((a[i]-ma)*(b[i]-mb) for i in range(n))
    da=sum((x-ma)**2 for x in a)**.5; db=sum((x-mb)**2 for x in b)**.5
    return num/(da*db)
w = chroma(lambda n: True)
res=[]
for r in range(12):
    res.append((corr(w,[MIN[(i-r)%12] for i in range(12)]), PC[r]+' min'))
    res.append((corr(w,[MAJ[(i-r)%12] for i in range(12)]), PC[r]+' MAJ'))
for c,k in sorted(res, reverse=True)[:8]: print('  KS %-8s %.3f' % (k,c))
# bass-only KS
wb = chroma(lambda n: n['ch']==1)
res=[]
for r in range(12):
    res.append((corr(wb,[MIN[(i-r)%12] for i in range(12)]), PC[r]+' min'))
for c,k in sorted(res, reverse=True)[:4]: print('  bass KS %-8s %.3f' % (k,c))
# last 4 bars chord tones
for b in [79,80,81]:
    d=defaultdict(float)
    for n in ns:
        if n['isDrum']: continue
        if gbar(n['tickOn'])==b: d[n['pitch']%12]+=n['durSec']
    print('bar %d pc:' % b, ' '.join('%s%.0f' % (PC[k],100*v/(sum(d.values()) or 1)) for k,v in sorted(d.items(), key=lambda x:-x[1])))
