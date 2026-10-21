# -*- coding: utf-8 -*-
"""把 Septette 扒谱 MIDI 直接压成色谱，和原曲录音比：判断扒谱本身对不对。"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\septette_zun.mp3'

midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
off = min(n['t'] for ns in (c['notes'] for c in chans.values()) for n in ns)
X = np.zeros((int(140 * 44100 / 4096) + 4, 12), np.float32)
for ch, c in chans.items():
    if ch == 9:
        continue
    for n in c['notes']:
        f0 = int(round((n['t'] - off) / (4096 / 44100.0)))
        f1 = max(f0 + 1, int(round((n['t'] + n['d'] - off) / (4096 / 44100.0))))
        for f in range(max(0, f0), min(len(X), f1)):
            X[f, n['m'] % 12] += 1.0
X = X / (X.sum(1, keepdims=True) + 1e-9)

x, sr = L.load_mono(REF)
(ch, bch), fps = L.chroma_frames(x, sr)

best = None
for rot in range(12):
    Xr = np.roll(X, rot, axis=1)
    for shift in range(-40, 41):
        nfr = min(len(Xr), len(ch))
        lo = max(0, shift); hi = min(nfr, nfr + shift)
        if hi - lo < 30:
            continue
        a = Xr[lo:hi]; b = ch[lo - shift:hi - shift]
        c = float(np.corrcoef(a.mean(1), b.mean(1))[0, 1])
        if best is None or c > best[0]:
            best = (c, shift, rot)
print('MIDI 色谱 vs 原曲：相关 %.3f  shift %+d 帧 (%.1fs)  移调 %+d' % (best[0], best[1], best[1] * 4096 / 44100.0, best[2]))
# 参照：随机打乱的基线
rng = np.random.default_rng(0)
base = []
for _ in range(40):
    perm = rng.permutation(len(ch))
    nfr = min(len(X), len(ch))
    a = X[:nfr]; b = ch[perm[:nfr]]
    base.append(float(np.corrcoef(a.mean(1), b.mean(1))[0, 1]))
print('基线（打乱）均值 %.3f 最大 %.3f' % (float(np.mean(base)), float(np.max(base))))
