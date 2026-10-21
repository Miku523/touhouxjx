# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import midi2js as M
import numpy as np
import _ref5_lib as L

BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
path = BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'
midi = M.parse_midi(path)
chans, segs, div = M.extract_channels(midi)

x, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\boss5\refA.mp3')
n_fft, hop = 4096, 512
win = np.hanning(n_fft).astype(np.float32)
fr = np.lib.stride_tricks.sliding_window_view(x, n_fft)[::hop]
mag = np.abs(np.fft.rfft(fr * win, axis=1)).astype(np.float32)
freqs = np.fft.rfftfreq(n_fft, 1.0/sr)
binw = freqs[1] - freqs[0]
fps = sr / hop
NOTES = list(range(33, 106))
bandmax = {}
for m in NOTES:
    f0 = 440 * 2 ** ((m - 69) / 12)
    tol = max(0.025 * f0, 1.2 * binw)
    mask = (freqs >= f0 - tol) & (freqs <= f0 + tol)
    if not mask.any():
        mask = np.zeros_like(freqs, bool); mask[np.argmin(np.abs(freqs - f0))] = True
    bandmax[m] = mag[:, mask].max(1)
BM = np.stack([bandmax[m] for m in NOTES], axis=1)
rank = np.argsort(np.argsort(-BM, axis=1), axis=1)
TOPK = (rank < 3).astype(np.float32)

def score(notes, min_dur=0.10):
    tot = 0.0; n = 0
    for nn in notes:
        if nn['d'] < min_dur: continue
        t, d, m = nn['t'], nn['d'], nn['m']
        if m not in bandmax: continue
        i0 = int(t * fps); i1 = int((t + min(max(d, 0.05), 0.30)) * fps) + 1
        if i1 <= i0: continue
        i1 = min(i1, TOPK.shape[0] - 1)
        tot += float(TOPK[i0:i1, m - 33].mean()); n += 1
    return (tot / n if n else 0.0), n

print('通道  全部音符 | 每 onset 最高声部 | 每 onset 最低声部')
for ch in sorted(chans):
    if ch == 9 or not chans[ch]['notes']: continue
    ns = chans[ch]['notes']
    ons = {}
    for nn in ns: ons.setdefault(round(nn['t'], 2), []).append(nn)
    tops = [max(v, key=lambda z: z['m']) for v in ons.values()]
    bots = [min(v, key=lambda z: z['m']) for v in ons.values()]
    a, na = score(ns); b, nb = score(tops); c, nc = score(bots)
    print('ch%-2d  n=%-5d %.3f (%d)   %.3f (%d)   %.3f (%d)' % (ch, len(ns), a, na, b, nb, c, nc))
