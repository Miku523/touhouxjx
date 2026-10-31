# -*- coding: utf-8 -*-
import sys, os, json
from collections import Counter, defaultdict
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
BASE2 = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')
MID = os.path.join(BASE2, '13. Septette for a Dead Princess (ZUN).mid')
SHIFT = 2360          # music-bar origin (MIDI bar1 line +440)
DIV = 480
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
def gbar(t): return int((t - SHIFT) // 1920) + 1
def gbeat(t): return ((t - SHIFT) % 1920) / 480.0 + 1.0
last = max(n['tickOff'] for n in ns)
NB = gbar(last)
pitched = [n for n in ns if not n['isDrum']]
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
PCN   = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
byb = defaultdict(list)
for n in ns: byb[gbar(n['tickOn'])].append(n)
density = {}
for c in range(16):
    density[c] = [len([n for n in byb.get(b,[]) if n['ch']==c]) for b in range(1, NB+1)]
print('NB(game bars)=', NB, 'durationSec=%.3f' % g['seconds'], 'lastTick=', last)
print('first note: bar %d beat %.2f' % (gbar(2840), gbeat(2840)))
print()
print('bar ch1 ch2 ch3 ch4 ch5 ch6 ch7 ch8 ch9 c10 c11 c12 c13 c14')
for b in range(1, NB+1):
    print('%3d %s' % (b, ' '.join('%3d' % density[c][b-1] for c in (1,2,3,4,5,6,7,8,9,10,11,12,13,14))))
json.dump({'NB':NB,'density':{str(k):v for k,v in density.items()}}, open(os.path.join(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_remi_ref','_density.json'),'w'))
