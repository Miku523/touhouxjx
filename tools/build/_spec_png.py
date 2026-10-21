# -*- coding: utf-8 -*-
"""refA 对数频谱图（供眼睛看主旋律线）。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf
from PIL import Image

REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)))
x, sr = sf.read(REF, always_2d=False)
if x.ndim > 1:
    x = x.mean(axis=1)
x = x.astype(np.float64)

NFFT = 4096
HOP = 1024
fps = sr / HOP
win = np.hanning(NFFT)
F = np.fft.rfftfreq(NFFT, 1.0/sr)
# 对数频率轴：100Hz - 3500Hz
FL, FH, H = 100.0, 3500.0, 700
fy = FL * (FH/FL) ** (np.arange(H)/ (H-1.0))
fidx = np.searchsorted(F, fy)
fidx = np.clip(fidx, 0, len(F)-1)

for name, t0, t1 in (('a', 0.0, 26.0), ('b', 24.0, 50.0), ('c', 48.0, 74.0), ('d', 72.0, 100.0)):
    i0, i1 = int(t0*sr), int(t1*sr)
    n = (i1-i0)//HOP
    S = np.zeros((H, n), dtype=np.float32)
    for k in range(n):
        seg = x[i0+k*HOP:i0+k*HOP+NFFT]
        if len(seg) < NFFT:
            break
        mag = np.abs(np.fft.rfft(seg*win))[fidx]
        S[:, k] = mag
    S = 20*np.log10(S + 1e-6)
    S = np.clip((S - (S.max()-60)) / 60.0, 0, 1)
    # 纵向翻转（低频在下）
    img = (S[::-1]*255).astype(np.uint8)
    im = Image.fromarray(img, 'L').convert('RGB')
    im = im.resize((int(n*2), H), Image.BILINEAR)
    p = os.path.join(OUT, 'pre6_spec_%s.png' % name)
    im.save(p)
    # 参考刻度
    print(p, im.size, '%.1f-%.1fs' % (t0, t1))
