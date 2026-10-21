# -*- coding: utf-8 -*-
import sys, os, glob
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith'
files = sorted(glob.glob(os.path.join(base, '8. Fall of Fall*.mid')))
for f in files:
    midi = M.parse_midi(f)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    print('===', os.path.basename(f))
    print('   %.1f BPM  %.1fs  通道 %d 个' % (bpm, end, len(chans)))
    for ch in sorted(chans):
        c = chans[ch]
        ns = c['notes']
        if not ns: continue
        lo = min(n['m'] for n in ns); hi = max(n['m'] for n in ns)
        prog = sorted(c['progs'].items(), key=lambda kv: -kv[1])[:2]
        print('   ch%-2d %4d 音  音域 %d-%d  首次 %.2fs  末次 %.2fs  prog %s'
              % (ch, len(ns), lo, hi, min(n['t'] for n in ns), max(n['t'] for n in ns), prog))
