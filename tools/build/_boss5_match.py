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
bpm = M.bpm_of(segs); bar = 4*60/bpm

# 游戏内现有 stage5 三轨
js = r'''
import { BOSS_SONGS } from '../../src/engine/songs/touhou.js';
console.log(JSON.stringify(BOSS_SONGS.stage5.tracks.map(t => t.notes)));
'''
open(ROOT + r'\tools\build\_s5_raw.mjs','w',encoding='utf-8').write(js)
out = subprocess.run(['node', r'tools\build\_s5_raw.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
tracks = json.loads(out.stdout)
print('game tracks', [len(t) for t in tracks])
for ti, tr in enumerate(tracks):
    idx = {}
    for n in tr: idx.setdefault(round(n[0],2), []).append(n[1])
    print('--- game track%d (n=%d rng %d-%d) ---' % (ti, len(tr), min(n[1] for n in tr), max(n[1] for n in tr)))
    res = []
    for ch in sorted(chans):
        if ch == 9 or not chans[ch]['notes']: continue
        hit = 0
        B = chans[ch]['notes']
        bidx = {}
        for n in B: bidx.setdefault(round(n['t'],2), []).append(n['m'])
        for t, lst in idx.items():
            for m in lst:
                ok = False
                for dt in (-0.05,-0.02,0.0,0.02,0.05):
                    for mm in bidx.get(round(t+dt,2), []):
                        if mm - m in (0, 12, -12): ok = True; break
                    if ok: break
                if ok: hit += 1
        res.append((hit/len(tr), ch))
    res.sort(reverse=True)
    print('   match:', [(round(r,2), c) for r, c in res[:5]])
