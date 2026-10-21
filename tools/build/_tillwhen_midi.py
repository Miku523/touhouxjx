# -*- coding: utf-8 -*-
import sys, os, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
for name in ('11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',
             '11. Hiroari Shoots a Strange Bird ~ Till When (hisaraito).mid'):
    f = os.path.join(base, name)
    print('\n########', name)
    mf = M.parse_midi(f)
    chans, segs, div = M.extract_channels(mf)
    bpm = M.bpm_of(segs)
    print('  BPM', bpm, ' tempo 段:', [(round(s[1],2), round(60e6/s[2],2)) for s in segs][:8], ' div', div)
    print('  通道:')
    for i in sorted(chans):
        c = chans[i]
        ns = c['notes']
        if not ns: continue
        lo = min(n['m'] for n in ns); hi = max(n['m'] for n in ns)
        t0 = min(n['t'] for n in ns); t1 = max(n['t'] for n in ns)
        print('   ch%-2d prog%-3s %4d 音  %3d-%3d  起 %6.2f  止 %6.2f' % (i, c.get('prog'), len(ns), lo, hi, t0, t1))
