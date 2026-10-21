# -*- coding: utf-8 -*-
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import midi2js as M, _ref5_lib as L
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(MID))
lead = sorted(chans[3]['notes'], key=lambda n: n['t'])
print('末 12 音:', [(NAMES[n['m']%12], round(n['t']+n['d'],1)) for n in lead[-12:]])
h = np.zeros(12)
for n in lead:
    h[n['m'] % 12] += n['d']
h = (h - h.mean()) / (h.std() + 1e-9)
print('旋律 key_of:', [(round(r,3), n, m) for r, n, m, _ in L.key_of(h[None, :])[:4]])
bass = sorted(chans[1]['notes'], key=lambda n: n['t'])
print('低音末 10 音:', [(NAMES[n['m']%12], round(n['t']+n['d'],1)) for n in bass[-10:]])
hb = np.zeros(12)
for n in bass:
    hb[n['m'] % 12] += n['d']
hb = (hb - hb.mean()) / (hb.std() + 1e-9)
print('低音 key_of:', [(round(r,3), n, m) for r, n, m, _ in L.key_of(hb[None, :])[:4]])
# 旋律首句的音程型（原曲开头 4 小节）
print('旋律前 24 音音高:', [n['m'] for n in lead[:24]])
