# -*- coding: utf-8 -*-
import sys, os, glob
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith',
                 '8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid')
midi = M.parse_midi(f)
chans, segs, div = M.extract_channels(midi)
for ch in (0, 1, 2, 3, 5, 7):
    ns = sorted(chans[ch]['notes'], key=lambda n: n['t'])
    durs = [n['d'] for n in ns]
    print('ch%-2d %4d 音 平均时值 %.2fs 音域 %d-%d' % (ch, len(ns), sum(durs)/len(durs), min(n['m'] for n in ns), max(n['m'] for n in ns)))
    print('    前 12 音:', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns[:12]])
    # 每 8 小节音数
    bpm = M.bpm_of(segs); bar = 4*60/bpm
    print('    8小节分段音数:', [sum(1 for n in ns if k*8*bar <= n['t'] < (k+1)*8*bar) for k in range(8)])
