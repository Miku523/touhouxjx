# -*- coding: utf-8 -*-
"""用色谱轨迹对齐 refA 音频与 MIDI（八度无关），再定各通道可听度"""
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
(out, ch_fps) = L.chroma_frames(x, sr)
ach = out[0]  # 和声色谱
print('audio chroma', ach.shape, 'fps', ch_fps)

# MIDI 色谱（0.05s 网格，按时值加权）
step = 0.05
dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
nf = int(dur/step) + 1
mch = np.zeros((nf, 12), np.float32)
for ch, c in chans.items():
    if ch == 9: continue
    for n in c['notes']:
        i0 = int(n['t']/step); i1 = min(nf, int((n['t']+max(n['d'],0.02))/step)+1)
        mch[i0:i1, n['m'] % 12] += n['v']/127.0
mch = mch / (mch.sum(1, keepdims=True) + 1e-9)
mch = (mch - mch.mean(1, keepdims=True))
mch = mch / (np.linalg.norm(mch, axis=1, keepdims=True) + 1e-9)

# 音频色谱按 0.05s 重采样
t_audio = np.arange(ach.shape[0]) / ch_fps
a_norm = (ach - ach.mean(1, keepdims=True))
a_norm = a_norm / (np.linalg.norm(a_norm, axis=1, keepdims=True) + 1e-9)

t_midi = np.arange(nf) * step
best = None
for sig in np.arange(0.97, 1.06, 0.002):
    tt = t_midi * sig
    idx = np.searchsorted(t_audio, tt)
    ok = (idx > 0) & (idx < len(t_audio))
    s = (a_norm[idx[ok]] * mch[ok]).sum(1).mean()
    if best is None or s > best[0]:
        best = (float(s), float(sig), 0.0)
    for d in np.arange(-0.6, 0.61, 0.1):
        idx2 = np.searchsorted(t_audio, tt + d)
        ok2 = (idx2 > 0) & (idx2 < len(t_audio))
        s2 = (a_norm[idx2[ok2]] * mch[ok2]).sum(1).mean()
        if s2 > best[0]: best = (float(s2), float(sig), float(d))
print('chroma align', best)
s0, sig0, d0 = best
for sig in np.arange(sig0-0.002, sig0+0.0021, 0.0005):
    for d in np.arange(d0-0.1, d0+0.101, 0.02):
        tt = t_midi * sig + d
        idx = np.searchsorted(t_audio, tt)
        ok = (idx > 0) & (idx < len(t_audio))
        s = (a_norm[idx[ok]] * mch[ok]).sum(1).mean()
        if s > best[0]: best = (float(s), float(sig), float(d))
print('fine', best)
json.dump(dict(sig=best[1], delta=best[2], score=best[0]), open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_boss5_align3.json','w'))
