# -*- coding: utf-8 -*-
"""逐小节：低音根音 + 和弦 + 各通道音数，用来看段落与接缝"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import midi2js as M
import numpy as np
import _ref5_lib as L
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
midi = M.parse_midi(BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
NAMES = L.NAMES
def pn(m): return NAMES[m%12] + str(m//12-1)
rows = []
for b in range(0, 88):
    t0, t1 = b*bar, (b+1)*bar
    ch_chroma = np.zeros(12); bs = np.zeros(12)
    lowest = None
    for ch, c in chans.items():
        if ch == 9: continue
        for n in c['notes']:
            if t0 <= n['t'] < t1:
                w = min(n['d'], bar)
                ch_chroma[n['m'] % 12] += w * (n['v']/127)
                if ch in (1, 4, 15, 8) and n['m'] < 55:
                    bs[n['m'] % 12] += w
                    if lowest is None or n['m'] < lowest: lowest = n['m']
    if ch_chroma.sum() == 0: rows.append((b, '-', '-', '-')); continue
    cands = L.chord_fit(ch_chroma, bs + 0.2*bs.sum()/12)
    rows.append((b, pn(lowest) if lowest else '-', cands[0][1], cands[1][1]))
for i in range(0, 88, 4):
    group = rows[i:i+4]
    print('%3d-%3d | ' % (i, i+3) + ' | '.join('%s:%s/%s' % (r[1], r[2], r[3]) for r in group))
