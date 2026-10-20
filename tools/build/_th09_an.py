# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
for tag, p in (('TH09 冒険', base + r'\9 - Phantasmagoria of Flower View\7. Adventure of the Lovestruck Tomboy (ZUN).mid'),
               ('TH06 恋娘', base + r'\6 - The Embodiment of Scarlet Devil\5. Tomboyish Girl in Love (ZUN).mid')):
    mid = M.parse_midi(p); chans, segs, div = M.extract_channels(mid)
    bpm = M.bpm_of(segs); bar = 4*60/bpm
    dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
    print('==', tag, 'bpm %.1f dur %.1f bars %.1f' % (bpm, dur, dur/bar))
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns: continue
        st = M.chan_stats(ns)
        print('  ch%-2d n=%-4d prog=%-8s t=%.1f-%.1f 中位 %d mono %.2f dur %.2f' % (
            ch, len(ns), list(chans[ch]['progs'].keys()), min(n['t'] for n in ns), max(n['t']+n['d'] for n in ns),
            st['med'], 1-st['poly'], st['avg_dur']))
