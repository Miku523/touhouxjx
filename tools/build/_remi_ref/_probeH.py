# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
BASE2 = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')
MID = os.path.join(BASE2, '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
SHIFT=2360
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
PCN=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
def gbar(t): return int((t-SHIFT)//1920)+1
def gbeat(t): return ((t-SHIFT)%1920)/480.0+1.0
pitched=[n for n in ns if not n['isDrum']]
last=max(n['tickOff'] for n in ns)
tbar=gbar(last)
print('game bars =', tbar, ' first note bar/beat =', gbar(2840), gbeat(2840))
# chord per half-bar (2 beats)
TRI=[]
for r in range(12):
    TRI.append(('',r,(r+4)%12,(r+7)%12))
    TRI.append(('m',r,(r+3)%12,(r+7)%12))
def best_chord(a,b):
    pc={}; tot=0.0
    for n in pitched:
        s=max(n['tickOn'],a); e=min(n['tickOff'],b)
        if e<=s: continue
        d=e-s; pc[n['pitch']%12]=pc.get(n['pitch']%12,0.0)+d; tot+=d
    if tot<30: return None
    bass=min((n for n in pitched if n['tickOn']<b and n['tickOff']>a), key=lambda n:n['pitch'], default=None)
    best=None
    for suf,root,t3,t5 in TRI:
        e=sum(pc.get(x,0.0) for x in (root,t3,t5))
        sc=e/max(tot,1e-9)
        if best is None or sc>best[0]: best=(sc,root,suf)
    return best, pc
print()
print('bar  half  chord   fit   bass  pcs(rounded)')
for b in range(1, tbar+1):
    for h in (0,1):
        a=SHIFT+(b-1)*1920+h*960; bb=a+960
        r=best_chord(a,bb)
        if not r: continue
        (sc,root,suf),pc=r
        tot=sum(pc.values())
        top=' '.join('%s%d'%(NAMES[k],round(100*v/tot/10)*10) for k,v in sorted(pc.items(), key=lambda x:-x[1])[:4])
        print('%3d  %d  %-4s  %.2f  %s' % (b,h+1, PCN[root]+suf, sc, top))
