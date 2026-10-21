# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def bandpass(x, sr, lo, hi):
    n = len(x); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1.0/sr)
    m = (f >= lo) & (f <= hi)
    X[~m] = 0
    return np.fft.irfft(X, n).astype(np.float32)
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
a, _ = L.load_mono('tools/build/_tepes_full.wav')
b, _ = L.load_mono('tools/build/_tepes_nolead.wav')
n = min(len(a), len(b)); diff = (a[:n] - b[:n])
diff = np.pad(diff, (0, max(0, len(xr)-n)))
xrb = bandpass(xr, sr, 600, 1500)
dl = bandpass(diff[:len(xr)], sr, 600, 1500)
(chs, _), fps = L.chroma_frames(xrb, sr, hrange=(600, 1500))
(chl, _), _ = L.chroma_frames(dl, sr, hrange=(600, 1500))
off = int(round(57.44*fps)); win = int(round(fps*1.0)); m = min(len(chl), len(chs)-off)
tot = np.zeros(12); cnt = 0
print('t      corr@0   best(sh)')
for i in range(int(19.0*fps), m-win, win):
    A = chs[off+i:off+i+win].mean(0); B = chl[i:i+win].mean(0)
    if A.std() < 1e-9 or B.std() < 1e-9: continue
    best = (-9, 0)
    for s in range(12):
        r = np.corrcoef(A, np.roll(B, s))[0,1]
        if r > best[0]: best = (r, s)
    c0 = np.corrcoef(A, B)[0,1]
    tot[best[1]] += 1; cnt += 1
    print('%5.1f   %+.2f    %d (%+.2f)' % (i/fps, c0, best[1], best[0]))
print('best-shift votes:', {int(k): int(v) for k, v in zip(range(12), tot) if v})
