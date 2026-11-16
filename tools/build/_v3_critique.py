# -*- coding: utf-8 -*-
"""tools/build/_v3_critique.py — 对比两版母版的关键指标。
用法: python tools/build/_v3_critique.py path1 [path2 ...]
"""
import sys, json
import numpy as np, soundfile as sf

def analyze(path, name):
    x, sr = sf.read(path, frames=-1, always_2d=True)
    x = np.asarray(x, dtype=float); n = len(x)
    xm = x.mean(axis=1)
    hop = 2048; N = 4096; w = np.hanning(N)
    starts = np.arange(0, max(1, n - N), hop)
    bands = [(20, 63), (63, 125), (125, 250), (250, 500), (500, 2000),
             (2000, 4000), (4000, 8000), (8000, 16000)]
    acc = {b: 0.0 for b in bands}
    tot = 0.0
    frames = []
    for st in starts:
        seg = xm[st:st + N]
        if len(seg) < N:
            break
        sp = np.abs(np.fft.rfft(seg * w))
        f = np.fft.rfftfreq(N, 1.0 / sr)
        e = (sp ** 2).sum()
        tot += e
        frames.append((st / sr, 10 * np.log10(e + 1e-20)))
        for b in bands:
            m = (f >= b[0]) & (f < b[1])
            acc[b] += (sp[m] ** 2).sum()
    L = x[:, 0]; R = x[:, 1] if x.shape[1] > 1 else x[:, 0]
    lr = float(np.corrcoef(L, R)[0, 1]) if x.shape[1] > 1 else 1.0
    # 10s RMS 块动态
    blk = int(sr * 10)
    rms_blocks = []
    for i in range(0, n, blk):
        seg = x[i:i + blk]
        if len(seg) > sr * 2:
            rms_blocks.append(20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12))
    dyn = (max(rms_blocks) - min(rms_blocks)) if rms_blocks else 0.0
    hi = sum(acc[b] for b in [(2000, 4000), (4000, 8000), (8000, 16000)]) / max(tot, 1e-20)
    seam = float(abs(xm[-1] - xm[0]))
    slip = float(np.abs(np.diff(xm)).mean())
    out = {
        "name": name, "dur": round(n / sr, 3), "sr": sr,
        "peak": round(float(np.abs(x).max()), 4),
        "rms": round(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12), 2),
        "band63_125": round(10 * np.log10(acc[(63, 125)] / max(tot, 1e-20)), 2),
        "band2_16k_pct": round(hi * 100, 2),
        "dyn10s": round(dyn, 2),
        "lr_corr": round(lr, 3),
        "width": round(20 * np.log10(np.sqrt((L ** 2).mean()) / max(np.sqrt((R ** 2).mean()), 1e-12)), 2),
        "seam": round(seam, 5), "slip": round(slip, 5),
        "seam_ratio": round(seam / max(slip, 1e-12), 3),
    }
    return out

res = [analyze(p, p.split('/')[-1]) for p in sys.argv[1:]]
print(json.dumps(res, ensure_ascii=False, indent=1))
