# -*- coding: utf-8 -*-
"""原曲录音 vs 我的渲染：速度 / 拍号 / 调性 / 色度对齐。"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref5_lib as L

REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\septette_zun.mp3'
MINE = os.path.join(HERE, 'ex_sept_v01.wav')

x, sr = L.load_mono(REF)
print('原曲 %.2fs @ %dHz' % (len(x) / sr, sr))
xh = x[:int(sr * 135)]
energy, flux, fps, bands = L.percussive(xh, sr)
sig = flux.sum(1).astype(np.float64)
cands, conf = L.estimate_tempo(sig, fps, lo=100, hi=200, prior=145)
print('速度候选:', ' '.join('%.2f(%.3f)' % (b, s) for s, b in cands[:5]), '置信 %.2f' % conf)
bpm = cands[0][1]
beat = 60.0 / bpm
n = len(sig)
idx = np.arange(n) / fps
for meter in (3, 4):
    strong, weak = [], []
    k = 0
    tt = 0.4
    while tt < 130:
        e = float(np.interp(tt, idx, sig))
        (strong if k % meter == 0 else weak).append(e)
        tt += beat
        k += 1
    print('%d 拍/小节：第1拍均值 %.4f / 其它 %.4f -> 比 %.2f' % (
        meter, np.mean(strong), np.mean(weak), np.mean(strong) / max(1e-12, np.mean(weak))))

(ch, bch), fpsc = L.chroma_frames(x, sr)
print('原曲调性', L.key_of(ch, None)[:3])

y, sr2 = L.load_mono(MINE)
print('我的 %.2fs RMS %.4f' % (len(y) / sr2, float(np.sqrt((y ** 2).mean()))))
(cy, bcy), fpsy = L.chroma_frames(y, sr2)
print('我的调性', L.key_of(cy, None)[:3])
hop = 4096.0 / sr
best = None
for rot in range(12):
    cr = np.roll(ch, rot, axis=1)
    for shift in range(-40, 41, 1):
        nfr = min(len(cr), len(cy))
        lo = max(0, shift); hi = min(nfr, nfr + shift)
        if hi - lo < 20:
            continue
        a = cr[lo:hi]; b = cy[lo - shift:hi - shift]
        c = float(np.corrcoef(a.mean(1), b.mean(1))[0, 1])
        if best is None or c > best[0]:
            best = (c, shift, rot)
print('整曲色度相关 %.3f @ shift %+d 帧 (%.2fs) 移调 %+d 半音' % (best[0], best[1], best[1] * hop, best[2]))
# 逐段（每 8s）色度相关，shift/移调固定最优
nfr = min(len(ch), len(cy))
cs = []
for i in range(0, nfr - 40, 40):
    a = np.roll(ch, best[2], axis=1)[i:i + 40]
    b = cy[i - best[1]:i - best[1] + 40]
    if len(b) < 40:
        break
    cs.append(float(np.corrcoef(a.mean(1), b.mean(1))[0, 1]))
print('逐 9.3s 窗口色度相关:', ' '.join('%.2f' % c for c in cs))