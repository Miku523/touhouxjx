# -*- coding: utf-8 -*-
"""refA 音频抓顶部旋律线：每 16 分格取「最高且有分量」的谱峰，并做谐波排除。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf

REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
BPM = 162.0
BAR = 4*60/BPM
S16 = BAR/16.0

x, sr = sf.read(REF, always_2d=False)
if x.ndim > 1:
    x = x.mean(axis=1)
x = x.astype(np.float64)
print('refA %.2fs sr=%d' % (len(x)/sr, sr))

NFFT = 8192
HOP = 512
win = np.hanning(NFFT)
fps = sr / HOP

def peaks(mag, freqs, lo=180.0, hi=4200.0):
    idx = np.where((freqs >= lo) & (freqs <= hi))[0]
    out = []
    for i in idx:
        if 1 <= i < len(mag)-1 and mag[i] > mag[i-1] and mag[i] > mag[i+1] and mag[i] > 1e-6:
            a, b, c = mag[i-1], mag[i], mag[i+1]
            d = 0.5*(a-c)/(a-2*b+c+1e-12)
            f = freqs[i] + d*(freqs[1]-freqs[0])
            out.append((f, b))
    return out

# 先测一个窗口：bar 20-28（大概主旋律区）
t_scan0 = 30.0
x0 = int(t_scan0*sr)
cols = []
n = int(8*BAR*fps)
for k in range(n):
    i0 = x0 + k*HOP
    seg = x[i0:i0+NFFT]
    if len(seg) < NFFT:
        break
    mag = np.abs(np.fft.rfft(seg*win))
    freqs = np.fft.rfftfreq(NFFT, 1.0/sr)
    cols.append((k/HOP if False else k/fps, mag, freqs))
print('frames', len(cols))

def pick(mag, freqs, mode='highest'):
    ps = peaks(mag, freqs)
    if not ps:
        return None
    mx = max(p[1] for p in ps)
    ps = [p for p in ps if p[1] > 0.18*mx]
    # 谐波排除：若存在 f/2 附近（±3%）且幅度 > 0.5 本峰，则本峰可能是泛音
    kept = []
    for f, m in ps:
        harm = False
        for f2, m2 in ps:
            if f2 < f*0.8 and abs(f/f2 - round(f/f2)) < 0.03 and round(f/f2) >= 2 and m2 > 0.45*m:
                harm = True
                break
        if not harm:
            kept.append((f, m))
    if not kept:
        return None
    if mode == 'highest':
        return max(kept, key=lambda p: p[0])
    return max(kept, key=lambda p: p[1])

for mode in ('highest', 'strongest'):
    seq = []
    for t, mag, freqs in cols:
        p = pick(mag, freqs, mode)
        if p is None:
            seq.append(None)
        else:
            seq.append(69 + 12*np.log2(p[0]/440.0))
    # 每 16 分格取中位
    steps = []
    for i in range(int(len(seq)*HOP/sr/S16)):
        a = int(i*S16*sr/HOP)
        b = int((i+1)*S16*sr/HOP)
        v = [s for s in seq[a:b] if s is not None]
        steps.append(float(np.median(v)) if v else None)
    txt = []
    for v in steps:
        txt.append('---' if v is None else '%s%.0f' % (NAMES[int(round(v))%12], int(round(v))//12-1))
    print()
    print('== refA %s @ %.1fs（16 分格）==' % (mode, t_scan0))
    for i in range(0, len(txt), 16):
        print(' bar%5.1f  %s' % (i/16.0, ' '.join(txt[i:i+16])))
