# -*- coding: utf-8 -*-
"""yukari_ph 母版收尾 v12（力量版）：
EQ（亮度 + 低频重量 + 中频让位）→ 总线胶水压缩 → 段落修正 → 峰值软削波（降 crest）
→ 归一 -19.5dB RMS。目标：crest 16.5→13.4、峰值 0.45→0.34，与其它曲目同一密度档。
"""
import numpy as np, soundfile as sf, sys, json, argparse

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--tilt', type=float, default=4.5)
ap.add_argument('--bass-db', type=float, default=1.6)
ap.add_argument('--presence-db', type=float, default=1.0)
ap.add_argument('--mud-db', type=float, default=-0.8)
ap.add_argument('--comp-thresh', type=float, default=-21.0)
ap.add_argument('--comp-ratio', type=float, default=2.4)
ap.add_argument('--comp-attack', type=float, default=0.010)
ap.add_argument('--comp-release', type=float, default=0.16)
ap.add_argument('--ceil', type=float, default=0.335)
ap.add_argument('--knee', type=float, default=0.52)
ap.add_argument('--rms', type=float, default=-19.5)
ap.add_argument('--stereo-link', type=int, default=1)
a = ap.parse_args()

x, sr = sf.read(a.src, dtype='float64', always_2d=True)
n = len(x); ch_n = x.shape[1]
f = np.fft.rfftfreq(n, 1.0 / sr)
lf = np.log2(np.maximum(f, 1.0))

def shelf_db(freq, db, oct_width):
    return db * np.clip(0.5 - lf / (2 * oct_width), 0.0, 1.0)

def bell_db(freq, db, oct_width):
    return db * np.exp(-0.5 * (lf / oct_width) ** 2)

ramp = np.clip((f - 900.0) / 900.0, 0.0, 1.0)
g_db = a.tilt * ramp + shelf_db(95.0, a.bass_db, 0.6) + bell_db(360.0, a.mud_db, 0.8) + bell_db(3800.0, a.presence_db, 0.9)
g = 10.0 ** (g_db / 20.0)
for ch in range(ch_n):
    x[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch]) * g, n)

# 总线胶水压缩
det = np.maximum(np.abs(x[:, 0]), np.abs(x[:, 1])) if ch_n > 1 else np.abs(x[:, 0])
at = np.exp(-1.0 / (a.comp_attack * sr)); rl = np.exp(-1.0 / (a.comp_release * sr))
thr = 10 ** (a.comp_thresh / 20.0)
env = np.empty_like(det); e = 0.0
for i in range(n):
    d = det[i]
    e = at * e + (1 - at) * d if d > e else rl * e + (1 - rl) * d
    env[i] = e
gr = np.ones_like(env)
over = env > thr
gr[over] = (thr / env[over]) ** (1.0 - 1.0 / a.comp_ratio)
x *= gr[:, None]

# 段落电平修正（与 v11 相同的音乐意图）
END_T = 168.837; CODA_T = 168.837
SEC_FIX = [(0.0, 8.372, 0.0), (8.372, 30.698, 0.0), (30.698, 53.023, 0.9), (53.023, 75.349, -1.1),
           (75.349, 97.674, 1.25), (97.674, 120.0, 1.6), (120.0, 142.326, 2.4), (142.326, 164.651, 3.0),
           (164.651, END_T, 2.45), (CODA_T, 1e9, 0.0)]
env2 = np.ones(n)
def apply_span(t0, t1, db, R=0.18):
    gain = 10 ** (db / 20.0)
    i0, i1 = int(t0 * sr), min(int(t1 * sr), n)
    env2[i0:i1] *= gain
    Rk = int(R * sr)
    k = min(Rk, i0)
    if k > 0:
        w = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
        env2[i0 - k:i0] *= 1.0 + (gain - 1.0) * w
    k = min(Rk, n - i1)
    if k > 0:
        w = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / k)
        env2[i1:i1 + k] *= 1.0 + (gain - 1.0) * w
for t0, t1, db in SEC_FIX:
    if abs(db) > 1e-9:
        apply_span(t0, t1, db)
for t0, t1, db in ((0.0, 8.372, 4.0), (CODA_T, n / sr, 5.0)):
    gain = 10 ** (db / 20.0)
    i0, i1 = int(t0 * sr), min(int(t1 * sr), n)
    env2[i0:i1] *= gain
    k = min(int(0.35 * sr), max(0, n - i1))
    if k > 0:
        w = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / k)
        env2[i1:i1 + k] *= 1.0 + (gain - 1.0) * w
x *= env2[:, None]

# 峰值软削波：先归一 RMS，再把超过 knee 的峰压进 ceil
def norm_rms(y):
    r = np.sqrt(np.mean(np.sum(y ** 2, axis=1)))
    return y * (10 ** (a.rms / 20) / r)

def softclip(y, ceil, knee):
    u = np.abs(y)
    lim = knee * ceil
    z = np.where(u <= lim, u, lim + (ceil - lim) * np.tanh((u - lim) / (ceil - lim)))
    return np.sign(y) * z

x = norm_rms(x)
x = softclip(x, a.ceil, a.knee)
x = norm_rms(x)
# 削波后若峰值超 ceil 一点点，压回
pk = float(np.abs(x).max())
if pk > a.ceil:
    x *= a.ceil / pk
    x = norm_rms(x)

sf.write(a.dst, x, sr, subtype='PCM_16')
m = x.mean(axis=1)
pk2 = float(np.abs(m).max()); rms2 = 20 * np.log10(np.sqrt(np.mean(m ** 2)) + 1e-12)
win = int(0.4 * sr)
st = np.array([20 * np.log10(np.sqrt(np.mean(m[i:i+win] ** 2)) + 1e-12) for i in range(0, n - win, win)])
X = np.fft.rfft(m * np.hanning(n)); P = np.abs(X) ** 2
def band(lo, hi):
    i = (f >= lo) & (f < hi)
    return round(10 * np.log10(P[i].sum() / n + 1e-12), 2)
print(json.dumps(dict(dst=a.dst, peak=round(pk2, 4), rms=round(float(rms2), 2),
                      crest=round(20 * np.log10(pk2) - float(rms2), 2),
                      lra=round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2),
                      corr=round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 4) if ch_n > 1 else 1.0,
                      bands=dict(sub=band(20, 63), low=band(63, 125), lmid=band(125, 500), mid=band(500, 2000),
                                 himid=band(2000, 6000), hi=band(6000, 12000)),
                      gr_mean=round(float(np.mean(20 * np.log10(gr))), 2)), ensure_ascii=False))
