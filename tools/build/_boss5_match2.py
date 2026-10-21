# -*- coding: utf-8 -*-
import sys, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
path = BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'
midi = M.parse_midi(path)
chans, segs, div = M.extract_channels(midi)
tracks = json.loads(subprocess.run(['node', r'tools\build\_s5_raw.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8').stdout)
big = {}
for ch in sorted(chans):
    if ch == 9 or not chans[ch]['notes']: continue
    for n in chans[ch]['notes']:
        big.setdefault(round(n['t'], 1), []).append((ch, n['m']))
best = []
for ti, tr in enumerate(tracks):
    for tr_shift in range(-12, 13):
        for scale in (1.0, 1.0099):
            for off in (-0.2, -0.1, 0.0, 0.1, 0.2):
                hit = 0
                for n in tr:
                    t = round(n[0] * scale + off, 1)
                    cands = big.get(t, []) + big.get(round(t-0.1,1), []) + big.get(round(t+0.1,1), [])
                    if any(mm - (n[1] + tr_shift) in (0, 12, -12) for _, mm in cands):
                        hit += 1
                best.append((hit/len(tr), ti, tr_shift, round(scale,4), off))
best.sort(reverse=True)
for b in best[:10]: print(b)
