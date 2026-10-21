# -*- coding: utf-8 -*-
"""逐帧余弦相似度：扒谱 MIDI / 我的渲染 vs 原曲录音（比整曲均值相关灵敏得多）。"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L
import midi2js as M

DIR = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil')
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\septette_zun.mp3'
HOP = 4096.0 / 44100.0

x, sr = L.load_mono(REF)
(ch, bch), fps = L.chroma_frames(x, sr)

def norm(A):
    return A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)

def score(A, shift, rot):
    Ar = norm(np.roll(A, rot, axis=1))
    B = norm(ch)
    nfr = min(len(Ar), len(B))
    lo = max(0, shift); hi = min(nfr, nfr + shift)
    if hi - lo < 30:
        return -1
    a = Ar[lo:hi]; b = B[lo - shift:hi - shift]
    return float((a * b).sum(1).mean())

def best_align(A, range_s=(-5, 5), step=2):
    best = None
    for rot in range(12):
        for sh in range(int(range_s[0] / HOP), int(range_s[1] / HOP) + 1, step):
            sc = score(A, sh, rot)
            if sc > (best[0] if best else -9):
                best = (sc, sh, rot)
    return best

def midi_chroma(path):
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    alln = [n for c in chans.values() for n in c['notes']]
    t0 = min(n['t'] for n in alln)
    tlen = max(n['t'] + n['d'] for n in alln) - t0
    X = np.zeros((int(tlen / HOP) + 4, 12), np.float32)
    for chn, c in chans.items():
        if chn == 9:
            continue
        for n in c['notes']:
            f0 = int(round((n['t'] - t0) / HOP))
            f1 = max(f0 + 1, int(round((n['t'] + n['d'] - t0) / HOP)))
            for f in range(max(0, f0), min(len(X), f1)):
                X[f, n['m'] % 12] += 1.0
    return norm(X)

for f in ['13. Septette for a Dead Princess (ZUN).mid',
          '13. Septette for a Dead Princess (ryoya1295).mid',
          '13. Septette for a Dead Princess (Ezequiel-TM).mid']:
    A = midi_chroma(os.path.join(DIR, f))
    sc, sh, rot = best_align(A)
    print('%-50s 帧余弦 %.3f  shift %+5.2fs  移调 %+d' % (f[:50], sc, sh * HOP, (rot + 6) % 12 - 6))

y, sr2 = L.load_mono(os.path.join(HERE, 'ex_sept_v01.wav'))
(cy, bcy), _ = L.chroma_frames(y, sr2)
sc, sh, rot = best_align(norm(cy))
print('我的渲染 v01                              帧余弦 %.3f  shift %+5.2fs  移调 %+d' % (sc, sh * HOP, (rot + 6) % 12 - 6))
