# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
mid = M.parse_midi(p)
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs)
dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
print('BPM %.1f  dur %.2f  bars %.1f  chans %d' % (bpm, dur, dur/(4*60/bpm), len(chans)))
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if not ns: continue
    ms=[n['m'] for n in ns]
    print('ch%-2d n=%-4d prog=%-10s t=%6.1f-%6.1f 中位 %3d 音域 %d-%d' % (ch, len(ns), list(chans[ch]['progs'].keys()), min(n['t'] for n in ns), max(n['t']+n['d'] for n in ns), sorted(ms)[len(ms)//2], min(ms), max(ms)))
