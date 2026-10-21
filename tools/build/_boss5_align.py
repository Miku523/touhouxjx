# -*- coding: utf-8 -*-
"""对齐 MIDI 与原曲 refA 音频：用鼓点找 δ（可带轻微 σ）"""
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
x, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\boss5\refA.mp3')
energy, flux, fps, bands = L.percussive(x, sr)
tot = flux.sum(1)
tot = (tot - tot.min()) / (tot.max() - tot.min() + 1e-9)
t_arr = np.arange(len(tot)) / fps
def at(times):
    idx = np.clip(np.searchsorted(t_arr, times), 0, len(tot)-1)
    return tot[idx]
kicks = np.array([n['t'] for n in chans[9]['notes'] if n['m'] in (36, 49)])
print('kick/crash', len(kicks), 'first', kicks[:5], 'last', kicks[-1])
best = None
for sig in np.arange(0.985, 1.016, 0.0025):
    for d in np.arange(-1.0, 1.001, 0.02):
        s = at(kicks * sig + d).mean()
        if best is None or s > best[0]: best = (s, sig, d)
print('coarse best', best)
s0, sig0, d0 = best
for sig in np.arange(sig0-0.003, sig0+0.003, 0.0005):
    for d in np.arange(d0-0.03, d0+0.031, 0.005):
        s = at(kicks * sig + d).mean()
        if s > best[0]: best = (s, sig, d)
print('fine best', best)
# 用全鼓 + 底鼓分别验证
s, sig, d = best
def score(mat):
    return float(at(np.array([n['t'] for n in chans[9]['notes'] if n['m'] in mat]) * sig + d).mean())
print('kick36 %.3f snare38/40 %.3f hat42 %.3f crash49 %.3f all %.3f' % (
    score({36}), score({38,40}), score({42}), score({49}), score({36,38,40,42,45,46,48,49,50})))
json.dump(dict(sig=float(sig), delta=float(d), score=float(s)), open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_boss5_align.json','w'))
