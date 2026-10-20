# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
chans, segs, div = M.extract_channels(M.parse_midi(p))
bpm = M.bpm_of(segs); bar=4*60/bpm
print('bar = %.3fs' % bar)
for ch in (2, 4, 12, 14, 5, 10):
    ns = chans[ch]['notes']
    if not ns: continue
    cov = [len([n for n in ns if b*bar <= n['t'] < (b+8)*bar]) for b in range(0, 88, 8)]
    mons = sum(1 for n in ns if n['d'] >= 0.25)/len(ns)
    print('ch%-2d 每 8 小节: %s  长音占比 %.2f' % (ch, cov, mons))
