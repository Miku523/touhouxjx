# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
STEP=40
last=p.get('lastTick') or max(n['tickOff'] for n in ns)
N=last//STEP+2
x=[0.0]*N
for n in ns:
    if n['isDrum']: continue
    i=n['tickOn']//STEP
    if i<N: x[i]+=n['vel']/127.0
mean=sum(x)/N
x=[v-mean for v in x]
def ac(lag):
    s=0.0
    for i in range(N-lag): s+=x[i]*x[i+lag]
    return s/ (N-lag)
base=ac(0)
peaks=[]
for lag in range(8, 120):
    if lag*STEP<=4800:
        peaks.append((ac(lag)/base, lag*STEP))
peaks.sort(reverse=True)
print('top autocorr lags (ticks):')
for v,t in peaks[:15]: print('   lag %5d ticks  r=%.3f  (%.2f beats, %.2f bars)' % (t, v, t/480.0, t/1920.0))
print()
# onset density per 480 ticks (beats) to find strong beats
print('onset count by position-in-bar (mod 1920), 120-bins, drums excluded:')
h=Counter()
for n in ns:
    if n['isDrum']: continue
    h[n['tickOn']%1920//120]+=1
for k in range(16): print('   bin%2d (%5.2f beat) %4d' % (k, k*0.25, h.get(k,0)))
