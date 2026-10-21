# -*- coding: utf-8 -*-
"""高分辨率频带能量 → 对齐 refA 与 MIDI，并评估各通道在原曲里的可听度"""
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
x = np.append(x, np.zeros(16384, np.float32))
n_fft, hop = 16384, 2048
win = np.hanning(n_fft).astype(np.float32)
freqs = np.fft.rfftfreq(n_fft, 1.0/sr)
binw = freqs[1] - freqs[0]
NOTES = list(range(28, 108))
masks = {}
for m in NOTES:
    f0 = 440 * 2 ** ((m - 69) / 12)
    tol = max(0.022 * f0, 1.5 * binw)
    mask = np.where((freqs >= f0 - tol) & (freqs <= f0 + tol))[0]
    masks[m] = mask
nf = (len(x) - n_fft) // hop + 1
BAN = np.zeros((nf, len(NOTES)), np.float32)
for i in range(0, nf, 64):
    seg = np.lib.stride_tricks.sliding_window_view(x[i*hop:i*hop + (64-1)*hop + n_fft], n_fft)[::hop][:64]
    mag = np.abs(np.fft.rfft(seg * win, axis=1)).astype(np.float32)
    for j, m in enumerate(NOTES):
        mk = masks[m]
        BAN[i:i+mag.shape[0], j] = mag[:, mk].max(1) if len(mk) else 0
fps = sr / hop
print('frames', nf, 'fps %.2f' % fps, 'band shape', BAN.shape)
BAN = BAN / (BAN.max() + 1e-9)
np.save(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_refA_bands.npy', BAN)
json.dump(dict(fps=fps, notes=NOTES, n_fft=n_fft, hop=hop), open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_refA_bands.json','w'))

def band_at(t, m):
    i = int(round(t * fps))
    return BAN[i, NOTES.index(m)] if 0 <= i < nf and m in NOTES else 0.0

bass = [n for n in chans[4]['notes'] if n['d'] >= 0.08]
print('bass notes', len(bass))
best = None
for sig in np.arange(0.990, 1.011, 0.001):
    for d in np.arange(-0.8, 0.801, 0.02):
        s = np.mean([band_at(n['t']*sig + d, n['m']) for n in bass])
        if best is None or s > best[0]: best = (s, sig, d)
print('bass align', best)
s0, sig0, d0 = best
for sig in np.arange(sig0-0.0015, sig0+0.0016, 0.00025):
    for d in np.arange(d0-0.03, d0+0.031, 0.005):
        s = np.mean([band_at(n['t']*sig + d, n['m']) for n in bass])
        if s > best[0]: best = (s, sig, d)
print('fine', best)
json.dump(dict(sig=float(best[1]), delta=float(best[2])), open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_boss5_align2.json','w'))

SIG, DEL = best[1], best[2]
def scr(notes):
    vals = [band_at(n['t']*SIG + DEL, n['m']) for n in notes if n['d'] >= 0.10]
    return (float(np.mean(vals)), len(vals)) if vals else (0, 0)
print('\n通道可听度（音符原位）')
for ch in sorted(chans):
    if ch == 9 or not chans[ch]['notes']: continue
    a, na = scr(chans[ch]['notes'])
    ons = {}
    for nn in chans[ch]['notes']: ons.setdefault(round(nn['t'],2), []).append(nn)
    tops = [max(v, key=lambda z: z['m']) for v in ons.values()]
    b, nb = scr(tops)
    print('ch%-2d all %.4f (%d)  top %.4f (%d)' % (ch, a, na, b, nb))
