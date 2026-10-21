# -*- coding: utf-8 -*-
import sys, os, numpy as np, json
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
lead = json.load(open('tools/build/_ex_lead.json'))
OFF = 57.44
n_fft, hop = 4096, 512
win = np.hanning(n_fft)
frames = []
for i in range(0, len(xr) - n_fft, hop):
    frames.append(np.abs(np.fft.rfft(xr[i:i+n_fft] * win)))
S = np.array(frames, np.float32)
fps = sr / hop
freqs = np.fft.rfftfreq(n_fft, 1.0/sr)
band = (freqs > 520) & (freqs < 1500)
Sb = S[:, band]; fb = freqs[band]
Lg = np.log(Sb + 1e-6)
# 沿频率做 401 点滑动中位数当包络
env = np.zeros_like(Lg)
k = 201
for j in range(0, Lg.shape[1], 40):
    seg = Lg[:, max(0,j-k):j+k]
    env[:, j:j+40] = np.median(seg, axis=1, keepdims=True) if seg.shape[1] else 0
res = Lg - env

def pc_at(t):
    i = int(t * fps)
    if i < 0 or i >= res.shape[0]: return None, 0
    spec = res[i-1:i+2].mean(0)
    j = int(np.argmax(spec))
    f = fb[j]
    m = 69 + 12*np.log2(f/440.0)
    return int(round(m)) % 12, float(spec[j])

ok = tot = 0
rows = []
for t, m, d in lead:
    p, s = pc_at(t + OFF + 0.06)
    if p is None: continue
    tot += 1
    if p == m % 12: ok += 1
    rows.append((round(t,2), m, PC[p], PC[m%12], 'OK' if p == m%12 else 'X'))
print('匹配 %d/%d = %.0f%%' % (ok, tot, 100*ok/max(tot,1)))
for r in rows:
    if r[4] == 'X': print('  t=%5.2f  melody=%s  audio=%s' % (r[0], r[3], r[2]))
