# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
targets = [('TH06 おてんば恋娘', base + r'\6 - The Embodiment of Scarlet Devil\5. Tomboyish Girl in Love (ZUN).mid'),
           ('TH09 おてんば恋娘の冒険', base + r'\9 - Phantasmagoria of Flower View\7. Adventure of the Lovestruck Tomboy (ZUN).mid')]
for name, p in targets:
    mid = M.parse_midi(p); chans, segs, div = M.extract_channels(mid)
    dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
    bpm = M.bpm_of(segs); bar = 4*60.0/bpm
    print('==', name, ' bpm %.1f  %.2fs  %.1f 小节' % (bpm, dur, dur/bar))
    rows=[]
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns: continue
        st = M.chan_stats(ns)
        rows.append((len(ns), ch, list(chans[ch]['progs'].keys()), min(n['t'] for n in ns), max(n['t']+n['d'] for n in ns), st['med'], 1-st['poly']))
    for n,ch,progs,t0,t1,med,mono in sorted(rows, reverse=True):
        print('  ch%-2d n=%-4d prog=%-8s t=%.1f-%.1f 中位 %d 单音性 %.2f' % (ch,n,progs,t0,t1,med,mono))
