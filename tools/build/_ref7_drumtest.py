# -*- coding: utf-8 -*-
"""_ref7_drumtest.py —— 试验鼓通道检测：频段掩码 + 严格阈值，比较不同门限下的每小节起音数。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
D = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))

BANDS = [('kick', [(28, 105)]), ('snare', [(160, 420)]), ('hat', [(6500, 16000)])]


def band_env(x, sr, n_fft=512, hop=128):
    fr = L5._frames(x, n_fft, hop)
    win = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    n = fr.shape[0]
    out = {}
    for k, ranges in BANDS:
        m = np.zeros_like(freqs, bool)
        for lo, hi in ranges:
            m |= (freqs >= lo) & (freqs < hi)
        e = np.zeros(n, np.float64)
        for i in range(0, n, 1024):
            sp = np.abs(np.fft.rfft(fr[i:i + 1024] * win, axis=1))
            e[i:i + sp.shape[0]] = sp[:, m].sum(1)
        out[k] = e
    return out, sr / hop


def onset_env(e, fps):
    le = np.log1p(e / (np.median(e[e > 1e-6]) + 1e-9))
    d = np.diff(le, prepend=le[0])
    d = np.maximum(d, 0.0)
    w = max(1, int(0.012 * fps))
    if w > 1:
        d = np.convolve(d, np.ones(w) / w, mode='same')
    return d


def pick(env, k, gap):
    base = np.median(env)
    mad = np.median(np.abs(env - base)) + 1e-9
    thr = base + k * mad
    idx = np.where((env[1:-1] > env[:-2]) & (env[1:-1] >= env[2:]) & (env[1:-1] > thr))[0] + 1
    g = max(1, int(gap))
    keep = []
    for i in idx:
        if not keep or i - keep[-1] >= g:
            keep.append(i)
    return np.array(keep)


def profile(env, fps, off, bar_sec, nbars):
    """16 格槽位剖面：每小节每槽取窗口最大，跨小节取中位数；返回 med16 与 hit%(相对小节内基线)。"""
    e16 = bar_sec / 16.0
    half = max(1, int(0.030 * fps))
    med = np.zeros(16)
    hit = np.zeros(16)
    sums = np.zeros(16)
    cnt = 0
    for b in range(nbars):
        vals = np.zeros(16)
        ok = True
        for s in range(16):
            c = int(round((off + b * bar_sec + s * e16) * fps))
            if c - half < 0 or c + half >= len(env):
                ok = False
                break
            vals[s] = env[c - half:c + half + 1].max()
        if not ok:
            continue
        cnt += 1
        sums += vals
        med = np.vstack([med, vals]) if cnt > 1 else vals[None, :]
        base = np.median(vals)
        sd = np.median(np.abs(vals - base)) + 1e-9
        hit += (vals > base + 1.6 * sd).astype(float)
    m = np.median(med, 0) if cnt else np.zeros(16)
    return m / (m.max() + 1e-9), np.round(hit / max(1, cnt) * 100)


for nm in (sys.argv[1:] or ['ref4']):
    d = D[nm]
    x, sr = L5.load_mono(os.path.join(SRC, nm + '.mp3'))
    envs, fps = band_env(x, sr)
    bpm, off = d['bpm'], d['beat_offset']
    bar_sec = d['bar_sec']
    dur = d['dur']
    nbars = int((dur - off) / bar_sec)
    print('=' * 100)
    print('%s bpm %.2f off %.3f bar_sec %.4f bars %d fps %.1f' % (nm, bpm, off, bar_sec, nbars, fps))
    for k, rng in BANDS:
        env = onset_env(envs[k], fps)
        print('  [%s] env median %.4f p99 %.4f max %.4f' % (k, np.median(env), np.percentile(env, 99), env.max()))
        for kk in (2.0, 3.0, 4.0, 6.0):
            for gap in (0.06, 0.10):
                pk = pick(env, kk, gap * fps)
                print('     k=%.1f gap=%.2f -> %d 起音, 每小节 %.2f' % (kk, gap, len(pk), len(pk) / nbars))
        m, hit = profile(env, fps, off, bar_sec, nbars)
        print('     med16 %s' % np.round(m, 2))
        print('     hit%%  %s' % hit)
