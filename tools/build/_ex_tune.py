# -*- coding: utf-8 -*-
import sys, os, numpy as np, json
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
lead = json.load(open('tools/build/_ex_lead.json'))
OFF = 57.44
def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)

def peak_freq(x, sr, t, dur, f0):
    i0 = int(t * sr); i1 = int((t + dur) * sr)
    seg = x[i0:i1]
    if len(seg) < 512: return None
    w = np.hanning(len(seg))
    N = 1 << int(np.ceil(np.log2(len(seg) * 8)))
    mag = np.abs(np.fft.rfft(seg * w, N))
    freqs = np.fft.rfftfreq(N, 1.0 / sr)
    lo, hi = f0 * 0.94, f0 * 1.06
    m = (freqs > lo) & (freqs < hi)
    if not m.any(): return None
    idx = np.where(m)[0]
    k = idx[np.argmax(mag[m])]
    if k <= 0 or k >= len(mag) - 1: return freqs[k]
    a, b, c = mag[k-1], mag[k], mag[k+1]
    d = 0.5 * (a - c) / (a - 2*b + c + 1e-12)
    return (k + d) * sr / N

devs = []
for t, m, d in lead:
    tt = t + OFF
    if tt + 0.14 > len(xr)/sr: continue
    dur = min(0.13, max(0.07, d * 0.7))
    f = peak_freq(xr, sr, tt + 0.02, dur, hz(m))
    if f is None: continue
    cents = 1200 * np.log2(f / hz(m))
    if abs(cents) < 200:
        devs.append((round(t,2), m, round(cents,1)))
arr = np.array([d[2] for d in devs])
print('样本 %d  中位偏差 %.1f cents  均值 %.1f  25%%-75%% %.1f..%.1f' % (len(arr), np.median(arr), arr.mean(), np.percentile(arr,25), np.percentile(arr,75)))
hist = {}
for d in devs:
    key = int(round(d[2]/20.0)*20)
    hist[key] = hist.get(key,0)+1
print('直方（20 cents 一档）:', dict(sorted(hist.items())))
print('前 15 个:', devs[:15])
