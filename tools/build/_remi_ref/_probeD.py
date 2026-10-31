# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
pitched=[n for n in ns if not n['isDrum']]
last=max(n['tickOff'] for n in ns)
TRIADS=[]
for r in range(12):
    TRIADS.append((r,(r+4)%12,(r+7)%12))
    TRIADS.append((r,(r+3)%12,(r+7)%12))
def tri_fit(pc, total):
    best=0; bestt=None
    for t in TRIADS:
        e=sum(pc.get(x,0.0) for x in t)
        if e>best: best=e; bestt=t
    return best/max(total,1e-9), bestt
def analyze(o, W, label):
    fits=[]; 
    for k in range(0, 82*1920//W):
        a=o+k*W; b=a+W
        if a<0 or b>last: continue
        pc={}
        tot=0.0
        for n in pitched:
            s=max(n['tickOn'],a); e=min(n['tickOff'],b)
            if e<=s: continue
            d=e-s
            pc[n['pitch']%12]=pc.get(n['pitch']%12,0.0)+d
            tot+=d
        if tot<50: continue
        f,_=tri_fit(pc,tot)
        fits.append(f)
    if not fits: 
        print(label,'no data'); return
    print('%-28s windows=%3d  mean triadfit=%.3f  >=0.8:%.0f%%' % (label,len(fits),sum(fits)/len(fits), 100.0*sum(1 for f in fits if f>=0.8)/len(fits)))
for o in (80,200,320,440):
    for W in (1920, 960, 480):
        analyze(o, W, 'offset %d win %d' % (o,W))
