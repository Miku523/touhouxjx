# -*- coding: utf-8 -*-
"""在所有 Septette 扒谱里挑最贴原曲录音的那一份（色谱相关）。"""
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
x, sr = L.load_mono(REF)
(ch, bch), fps = L.chroma_frames(x, sr)

def midi_chroma(path):
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    alln = [n for c in chans.values() for n in c['notes']]
    if not alln:
        return None
    t0 = min(n['t'] for n in alln)
    tlen = max(n['t'] + n['d'] for n in alln) - t0
    X = np.zeros((int(tlen * 44100 / 4096) + 4, 12), np.float32)
    for chn, c in chans.items():
        if chn == 9:
            continue
        for n in c['notes']:
            f0 = int(round((n['t'] - t0) / (4096 / 44100.0)))
            f1 = max(f0 + 1, int(round((n['t'] + n['d'] - t0) / (4096 / 44100.0))))
            for f in range(max(0, f0), min(len(X), f1)):
                X[f, n['m'] % 12] += 1.0
    X = X / (X.sum(1, keepdims=True) + 1e-9)
    return X, tlen

files = [f for f in sorted(os.listdir(DIR)) if 'Septette' in f]
for f in files:
    got = midi_chroma(os.path.join(DIR, f))
    if got is None:
        continue
    X, tlen = got
    best = None
    for rot in range(12):
        Xr = np.roll(X, rot, axis=1)
        for shift in range(-40, 41, 2):
            nfr = min(len(Xr), len(ch))
            lo = max(0, shift); hi = min(nfr, nfr + shift)
            if hi - lo < 30:
                continue
            a = Xr[lo:hi]; b = ch[lo - shift:hi - shift]
            c = float(np.corrcoef(a.mean(1), b.mean(1))[0, 1])
            if best is None or c > best[0]:
                best = (c, shift, rot)
    print('%-52s 长 %6.1fs  相关 %.3f  shift %+5.1fs  移调 %+2d' % (
        f[:52], tlen, best[0], best[1] * 4096 / 44100.0, (best[2] + 6) % 12 - 6))
