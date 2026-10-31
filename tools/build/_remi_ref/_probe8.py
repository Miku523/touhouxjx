# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
pitched=[n for n in ns if not n['isDrum']]
print('=== per-channel pitch-class hist (top6) ===')
for c in range(16):
    sub=[n for n in pitched if n['ch']==c]
    if not sub: continue
    h=Counter(n['pitch']%12 for n in sub)
    top=' '.join('%s:%d'%(names[i],h[i]) for i in sorted(h,key=lambda x:-h[x])[:6])
    print(' ch%2d n=%4d  %s' % (c,len(sub),top))
print()
print('=== per-section all-pitched top5 ===')
for lo,hi in ((0,8),(8,16),(16,24),(24,32),(32,40),(40,48),(48,56),(56,64),(64,72),(72,82)):
    sub=[n for n in pitched if lo<=n['bar']<hi]
    h=Counter(n['pitch']%12 for n in sub)
    top=' '.join('%s:%d'%(names[i],h[i]) for i in sorted(h,key=lambda x:-h[x])[:6])
    print(' bars %2d-%2d n=%4d  %s' % (lo,hi-1,len(sub),top))
print()
print('=== key_guess sig ===')
import inspect; print(inspect.signature(M.key_guess))
