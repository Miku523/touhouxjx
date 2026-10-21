# -*- coding: utf-8 -*-
"""把游戏内 stage5 的旋律轨，拿去跟 6 个不同扒谱版本比对，找出它的出处"""
import sys, os, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
tracks = json.loads(subprocess.run(['node', r'tools\build\_s5_raw.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8').stdout)
game = tracks[0]
files = sorted([f for f in os.listdir(BASE) if f.startswith('13. Bloom')])
results = []
for f in files:
    midi = M.parse_midi(os.path.join(BASE, f))
    chans, segs, div = M.extract_channels(midi)
    dur = max([n['t']+n['d'] for c in chans.values() for n in c['notes']] or [1])
    for ch in sorted(chans):
        if ch == 9 or not chans[ch]['notes']: continue
        notes = chans[ch]['notes']
        idx = {}
        for n in notes: idx.setdefault(round(n['t'], 1), []).append(n['m'])
        for sh in range(-24, 25):
            hit = 0
            for n in game:
                t = round(n[0], 1)
                cands = idx.get(t, []) + idx.get(round(t-0.1,1), []) + idx.get(round(t+0.1,1), [])
                if any(mm - (n[1]+sh) in (0,12,-12) for mm in cands): hit += 1
            if hit/len(game) > 0.30:
                results.append((hit/len(game), f[4:45], ch, sh, round(dur,1)))
results.sort(reverse=True)
for r in results[:15]: print(round(r[0],2), '|', r[1], '| ch%d' % r[2], 'shift%+d' % r[3], '| dur', r[4])
print('--- none above 0.3?', len(results) == 0)
