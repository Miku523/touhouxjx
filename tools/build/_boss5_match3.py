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
SCALE = 1.0099
big = {}
for ch in sorted(chans):
    if ch == 9 or not chans[ch]['notes']: continue
    for n in chans[ch]['notes']:
        big.setdefault(round(n['t'], 1), []).append((ch, n['m']))
best = {}
for ti, tr in enumerate(tracks):
    for ch in sorted(chans):
        if ch == 9 or not chans[ch]['notes']: continue
        bch = {}
        for n in chans[ch]['notes']: bch.setdefault(round(n['t'],1), []).append(n['m'])
        for sh in range(-14, 15):
            hit = 0
            for n in tr:
                t = round(n[0]*SCALE, 1)
                cands = bch.get(t, []) + bch.get(round(t-0.1,1), []) + bch.get(round(t+0.1,1), [])
                if any(mm - (n[1]+sh) in (0,12,-12) for mm in cands): hit += 1
            r = hit/len(tr)
            key = (ti, ch)
            if key not in best or r > best[key][0]: best[key] = (r, sh)
for ti in range(len(tracks)):
    rows = sorted([(best[(ti,c)][0], c, best[(ti,c)][1]) for c in sorted(chans) if c != 9 and (ti,c) in best], reverse=True)
    print('game track%d (n=%d):' % (ti, len(tracks[ti])), [(round(r,2), 'ch%d' % c, sh) for r, c, sh in rows[:4]])
