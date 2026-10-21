# -*- coding: utf-8 -*-
"""解剖原曲 MIDI：13. Bloom Nobly ... (ZUN).mid"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
for fname in ['13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid']:
    path = BASE + '\\' + fname
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    print('###', fname)
    print('bpm', bpm, 'div', div, 'nseg', len(segs), 'segs[:4]', [(round(t,2), round(s,2), u) for t, s, u in segs[:4]])
    end = 0
    for ch, c in chans.items():
        for n in c['notes']:
            end = max(end, n['t'] + n['d'])
    print('end', round(end,3), 'bar4', round(4*60/bpm,4))
    for ch in sorted(chans):
        c = chans[ch]
        notes = c['notes']
        if not notes: continue
        st = M.chan_stats(notes)
        ms = [n['m'] for n in notes]
        print('ch%-3d n=%-5d rng %d-%d med %d poly %.2f dur %.2f v %.0f leap %.1f start %.2f end %.2f progs %s' % (
            ch, st['count'], min(ms), max(ms), st['med'], st['poly'], st['avg_dur'], st['avg_vel'], st['leap'],
            notes[0]['t'], max(n['t']+n['d'] for n in notes), c['progs']))
        if ch == 9:
            kinds = {}
            for n in notes: kinds[n['m']] = kinds.get(n['m'],0)+1
            print('     drums', sorted(kinds.items()))
