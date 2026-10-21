# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def show(ch, a, b, limit=26):
    ns = [n for n in chans[ch]['notes'] if a <= n['t'] < b]
    ns.sort(key=lambda n: n['t'])
    print('ch%d %g-%gs: %d 音，前 %d 个 (t,m,d):' % (ch, a, b, len(ns), limit))
    print('   ', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns[:limit]])
for ch in (0,1,5,6,10):
    show(ch, 20, 40)
