# -*- coding: utf-8 -*-
"""_ref6_probe_key.py —— 调性/速度八度歧义细查"""
import os
import sys
import math

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

CACHE = os.path.join(HERE, '_ref6_feat')
TAGS = ['ref1', 'ref3', 'ref5']


def load_feat(tag):
    z = np.load(os.path.join(CACHE, tag + '.npz'))
    d = {k: z[k] for k in z.files}
    d['fps'] = 22050 / 512.0
    d['sr'] = 22050
    d['duration'] = float(d['times'][-1])
    return d


def key_top(feat, t0=None, t1=None, n=5, band='chroma'):
    times = feat['times']
    m = np.ones(len(times), bool)
    if t0 is not None:
        m &= times >= t0
    if t1 is not None:
        m &= times <= t1
    ch = feat[band][m].astype(np.float64)
    w = np.maximum(feat['rms'][m].astype(np.float64), 1e-6)
    chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
    prof = (chn * w[:, None]).sum(axis=0) / w.sum()
    prof = prof / prof.sum()
    res = []
    for mode, tmpl in (('major', L.KS_MAJOR), ('minor', L.KS_MINOR), ('dorian', L.KS_DORIAN)):
        t = tmpl / tmpl.sum()
        for root in range(12):
            tt = np.roll(t, root)
            a = prof - prof.mean()
            b = tt - tt.mean()
            r = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
            res.append((r, root, mode))
    res.sort(key=lambda x: -x[0])
    return prof, res[:n]


def chroma_lag_peaks(feat, maxlag=8.0, band='chroma'):
    """色度自相关（秒）→ 和声变化周期。"""
    times = feat['times']
    ch = feat[band].astype(np.float64)
    chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
    chn = chn - chn.mean(axis=0)
    fps = feat['fps']
    n = len(chn)
    # 下采样到 ~10Hz 以省时间
    step = max(1, int(round(fps / 10.0)))
    x = chn[::step]
    f2 = fps / step
    N = 1 << int(np.ceil(np.log2(2 * len(x))))
    ac = np.zeros(int(maxlag * f2) + 2)
    for p in range(12):
        F = np.fft.rfft(x[:, p], N)
        a = np.fft.irfft(F * np.conj(F), N)[:len(ac)]
        a = a / (np.arange(len(a), 0, -1)) if len(a) < len(x) else a / len(x)
        ac += a
    ac = ac / (ac[0] + 1e-12)
    peaks = []
    for i in range(2, len(ac) - 1):
        if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1]:
            peaks.append((round(i / f2, 3), round(float(ac[i]), 4)))
    peaks.sort(key=lambda x: -x[1])
    return peaks[:10]


def drum_grid(feat, bpm, phase, n_bins=16):
    times = feat['times']
    envs = {'kick': L.onset_env(feat, 'flux_low'),
            'mid': L.onset_env(feat, 'flux_mid'),
            'hat': L.onset_env(feat, 'flux_hi'),
            'all': L.onset_env(feat)}
    period = 60.0 / bpm
    step = period / (n_bins / 4.0)
    out = {}
    for k, env in envs.items():
        prof = np.zeros(n_bins)
        cnt = np.zeros(n_bins)
        t = phase
        n = 0
        while t < times[-1]:
            m = (times >= t - 0.045) & (times <= t + 0.045)
            if m.sum():
                prof[n % n_bins] += float(env[m].max())
                cnt[n % n_bins] += 1
            t += step
            n += 1
        prof = prof / np.maximum(cnt, 1)
        out[k] = prof / (prof.max() + 1e-9)
    return out


def best_phase(feat, bpm, n_try=48):
    env = L.onset_env(feat)
    times = feat['times']
    period = 60.0 / bpm
    best = (-1, 0)
    for k in range(n_try):
        ph = k * period / n_try
        pos = ph + period * np.arange(int((times[-1] - ph) / period) + 1)
        pos = pos[(pos > 0) & (pos < times[-1])]
        v = np.interp(pos, times, env)
        if v.mean() > best[0]:
            best = (float(v.mean()), ph)
    return best[1]


def main():
    feats = {t: load_feat(t) for t in TAGS}
    # ---------- 调性
    print('#' * 70)
    print('KEY (multiple bands/time windows)')
    for tag in TAGS:
        f = feats[tag]
        print('-' * 60)
        print(tag)
        for band in ('chroma', 'chroma_hi', 'chroma_bass'):
            prof, res = key_top(f, band=band, n=4)
            print('  [%s] hist=%s' % (band, np.round(prof, 3).tolist()))
            print('       top: %s' % ['%s%s r=%.3f' % (L.NOTE_NAMES[r], m[:3], s) for s, r, m in res])
        prof, res = key_top(f, 30, f['duration'] - 30, band='chroma', n=4)
        print('  [body 30s-end] top: %s' % ['%s%s r=%.3f' % (L.NOTE_NAMES[r], m[:3], s) for s, r, m in res])

    # ---------- ref1 vs ref5 色度对齐
    print('#' * 70)
    print('ref1 vs ref5 chroma cross-correlation (shift in semitones)')
    p1, _ = key_top(feats['ref1'], band='chroma')
    p5, _ = key_top(feats['ref5'], band='chroma')
    best = (-9, 0)
    for s in range(12):
        a = p1 - p1.mean()
        b = np.roll(p5, s) - np.roll(p5, s).mean()
        r = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
        print('   shift %2d semitones -> r=%+.3f' % (s, r))
        if r > best[0]:
            best = (r, s)
    print('   BEST shift=%d r=%.3f' % (best[1], best[0]))

    # ---------- 和声变化周期
    print('#' * 70)
    print('CHROMA LAG PEAKS (sec) -> harmonic rhythm')
    for tag in TAGS:
        print(tag, chroma_lag_peaks(feats[tag])[:8])

    # ---------- 两种速度解读下的鼓型
    print('#' * 70)
    for tag, cands in (('ref1', [152.0, 76.0]), ('ref3', [156.0, 78.0]), ('ref5', [152.0, 76.0])):
        f = feats[tag]
        for bpm in cands:
            ph = best_phase(f, bpm)
            g = drum_grid(f, bpm, ph, 16)
            print('%s @%.1f bpm phase=%.3f' % (tag, bpm, ph))
            print('   kick %s' % np.round(g['kick'], 2).tolist())
            print('   mid  %s' % np.round(g['mid'], 2).tolist())
            print('   hat  %s' % np.round(g['hat'], 2).tolist())


if __name__ == '__main__':
    main()
