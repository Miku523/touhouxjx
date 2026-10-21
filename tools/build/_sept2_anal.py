# -*- coding: utf-8 -*-
"""雷米战曲两条参考的解剖：mel = 原曲(140s) / bp = 蓝图(194s)"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L

D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
HOP = 4096.0 / 44100.0

def norm(A):
    return A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)

def bands(x, sr):
    n = len(x); sp = np.abs(np.fft.rfft(x * np.hanning(n)))
    f = np.fft.rfftfreq(n, 1.0 / sr)
    edges = [(20,120),(120,500),(500,2000),(2000,6000),(6000,16000)]
    e = np.array([float(sp[(f>=a)&(f<b)].__pow__(2).sum()) for a,b in edges])
    e = e / (e.sum() + 1e-12) * 100
    cen = float((sp[(f>=20)&(f<16000)] * f[(f>=20)&(f<16000)]).sum() / (sp[(f>=20)&(f<16000)].sum() + 1e-9))
    return e, cen

res = {}
for tag, name in [('mel','sept_mel.mp3'), ('bp','sept_bp.mp3')]:
    x, sr = L.load_mono(os.path.join(D, name))
    per = L.percussive(x, sr)
    cand = L.estimate_tempo(x[:int(54*sr)], sr)
    beats = L.beat_phase(x[:int(54*sr)], sr, cand[0][0]) if cand else None
    e, cen = bands(x, sr)
    rms = float(np.sqrt((x**2).mean()))
    print('== %s  %.1fs  RMS %.4f  峰 %.3f  质心 %.0fHz  频段 %s' % (tag, len(x)/sr, rms, float(np.abs(x).max()), cen, np.round(e,1)))
    print('   速度候选:', ' '.join('%.1f(%.2f)' % c for c in cand[:4]) if cand else '-')
    for k in range(0, int(len(x)/sr), 8):
        seg = x[int(k*sr):int((k+8)*sr)]
        print('   %3d-%3ds RMS %.3f' % (k, k+8, float(np.sqrt((seg**2).mean()))))
    res[tag] = (x, sr)

# 两版互相关（色谱余弦），查是不是同一首、同一结构
(chs, _) = (None, None)
def chroma(x, sr):
    (c, b), fps = L.chroma_frames(x, sr)
    return norm(c)
cm = chroma(*res['mel']); cb = chroma(*res['bp'])
best = None
for rot in range(12):
    cr = np.roll(cm, rot, axis=1)
    for shift in range(-80, 81, 2):
        nfr = min(len(cr), len(cb))
        lo = max(0, shift); hi = min(nfr, nfr + shift)
        if hi - lo < 40: continue
        a = cr[lo:hi]; b = cb[lo-shift:hi-shift]
        c = float((a*b).sum(1).mean())
        if best is None or c > best[0]:
            best = (c, shift, rot)
print('mel vs bp 帧余弦 %.3f  shift %+.2fs  移调 %+d' % (best[0], best[1]*HOP, (best[2]+6)%12-6))