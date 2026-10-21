# -*- coding: utf-8 -*-
"""_ref7_sec.py —— 段落 / 每段和弦 / 鼓型（16 格剖面 + 严格起音）。输出 _ref7_drums.json 与 _ref7_sections.json。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
D = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))
NAMES = L5.NAMES
BANDS = [('kick', [(28, 105)]), ('snare', [(160, 420)]), ('hat', [(6500, 16000)])]
KCFG = dict(kick=(4.0, 0.10), snare=(4.0, 0.10), hat=(3.0, 0.06))


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
    d = np.maximum(np.diff(le, prepend=le[0]), 0.0)
    w = max(1, int(0.012 * fps))
    return np.convolve(d, np.ones(w) / w, mode='same') if w > 1 else d


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
    e16 = bar_sec / 16.0
    half = max(1, int(0.030 * fps))
    rows, hit = [], np.zeros(16)
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
        rows.append(vals)
        base = np.median(vals)
        sd = np.median(np.abs(vals - base)) + 1e-9
        hit += (vals > base + 1.6 * sd).astype(float)
    R = np.array(rows)
    m = np.median(R, 0)
    return m / (m.max() + 1e-9), np.round(hit / max(1, len(rows)) * 100)


def drum_all(x, sr, d):
    bpm, off, bar_sec = d['bpm'], d['beat_offset'], d['bar_sec']
    dur = d['dur']
    nbars = int((dur - off) / bar_sec)
    envs, fps = band_env(x, sr)
    res = {}
    for k, _ in BANDS:
        env = onset_env(envs[k], fps)
        kk, gap = KCFG[k]
        pk = pick(env, kk, gap * fps)
        tt = pk / fps
        rel = (tt - off) / bar_sec
        rel = rel[(rel >= 0) & (rel < nbars)]
        bar_i = np.floor(rel).astype(int)
        slot = np.round((rel - bar_i) * 16).astype(int) % 16
        peak = np.round((rel - bar_i) * 4).astype(int) % 4
        hist16 = np.bincount(slot, minlength=16).tolist()
        amp16 = np.zeros(16)
        ampv = env[pk][(rel >= 0) & (rel < nbars)]
        for s, a in zip(slot, ampv):
            amp16[s] += a
        cnt16 = np.array(hist16, float) + 1e-9
        amp16 = amp16 / cnt16
        amp16 = amp16 / (amp16.max() + 1e-9)
        p16, hit16 = profile(env, fps, off, bar_sec, nbars)
        per_bar_counts = np.bincount(bar_i, minlength=nbars)
        res[k] = dict(
            n=int(len(rel)), per_bar=round(len(rel) / nbars, 2),
            hist16=[int(v) for v in hist16],
            beat_hist=[int(sum(hist16[i * 4:(i + 1) * 4])) for i in range(4)],
            prof16=[round(float(v), 2) for v in p16],
            hit16=[int(v) for v in hit16],
            amp16=[round(float(v), 2) for v in amp16],
            bars_with_hit=int((per_bar_counts > 0).sum()),
            max_per_bar=int(per_bar_counts.max()),
            max_at_bar=int(per_bar_counts.argmax()),
            count_series=[int(v) for v in per_bar_counts],
        )
    # 开镲比例：踩镲起音后 0.12s 仍有 >35% 能量
    he = envs['hat']
    hfps = fps
    hp = pick(onset_env(he, fps), *KCFG['hat'][:1], KCFG['hat'][1] * fps)
    op = 0
    for i in hp:
        j = min(len(he) - 1, i + int(0.12 * hfps))
        if he[j] > 0.35 * he[i]:
            op += 1
    res['open_hat_ratio'] = round(op / max(1, len(hp)), 2)
    # 双踩 / 16 分连续：kick 相邻帧间隔 < 0.12s 的比例
    kp = pick(onset_env(envs['kick'], fps), *KCFG['kick'][:1], KCFG['kick'][1] * fps)
    kt = np.sort(kp / fps)
    if len(kt) > 1:
        dt = np.diff(kt)
        res['kick_dt_median'] = round(float(np.median(dt)), 3)
        res['kick_dt_lt_012'] = round(float((dt < 0.12).mean()), 2)
        res['kick_dt_lt_018'] = round(float((dt < 0.18).mean()), 2)
    # 四踩：每小节 4 拍是否都有 kick
    off4 = 0
    for b in range(nbars):
        for p in range(4):
            t = off + b * bar_sec + p * bar_sec / 4
            if np.any(np.abs(kt - t) < 0.045):
                pass
        hits = [np.any(np.abs(kt - (off + b * bar_sec + p * bar_sec / 4)) < 0.045) for p in range(4)]
        if all(hits):
            off4 += 1
    res['four_on_floor_bars'] = off4
    res['four_on_floor_frac'] = round(off4 / max(1, nbars), 2)
    return res


def chord_hist(bars, key=0, lo=None, hi=None):
    c = {}
    for b in bars[lo:hi]:
        ch = b.get('chord')
        if ch:
            c[ch] = c.get(ch, 0) + 1
    return sorted(c.items(), key=lambda kv: -kv[1])[:12]


def transpose(name, k):
    if not name:
        return name
    import re
    m = re.match(r'^([A-G]#?)(.*)$', name)
    if not m:
        return name
    r = (NAMES.index(m.group(1)) + k) % 12
    return NAMES[r] + m.group(2)


def sections_of(d, bars):
    """基于每小节 rms / 频谱 / 密度 的自适应分段。"""
    rms = np.array([b['rms'] for b in bars], float)
    cen = np.array([b['cen'] for b in bars], float)
    den = np.array([b['density'] for b in bars], float)
    ent = np.array([b['chroma_entropy'] for b in bars], float)
    chroma = np.array([b['chroma'] for b in bars], float)
    n = len(bars)
    feats = []
    for v in (rms, np.log1p(np.maximum(cen, 0)), den, ent):
        x = v - np.median(v)
        s = np.median(np.abs(x)) * 1.4826 + 1e-9
        feats.append(x / s)
    F = np.stack(feats, 1)
    chn = chroma / (np.linalg.norm(chroma, axis=1, keepdims=True) + 1e-9)
    sim = np.array([float(chn[i] @ chn[min(n - 1, i + 4)]) for i in range(n)])
    F = np.concatenate([F, ((1.0 - sim) * 2)[:, None]], 1)
    W = 6
    sm = np.array([F[max(0, i - W):i + W + 1].mean(0) for i in range(n)])
    nov = np.zeros(n)
    for i in range(W, n - W):
        nov[i] = np.linalg.norm(sm[i + 1] - sm[i - 1])
    thr = np.percentile(nov, 76)
    cand = [i for i in range(8, n - 4) if nov[i] > thr]
    cand.sort(key=lambda i: -nov[i])
    keep = []
    for i in cand:
        if all(abs(i - j) >= 8 for j in keep):
            keep.append(i)
    keep.sort()
    return keep, [round(float(v), 3) for v in nov]


def summarize(d, bars, bounds, drums, key_transpose=0, tonic=None):
    n = len(bars)
    segs = []
    edges = [0] + bounds + [n]
    for a, b in zip(edges[:-1], edges[1:]):
        if b - a < 2:
            continue
        seg = bars[a:b]
        r = 20 * np.log10(float(np.mean([x['rms'] for x in seg])) + 1e-9)
        den = float(np.mean([x['density'] for x in seg]))
        cen = float(np.mean([x['cen'] for x in seg]))
        low = float(np.mean([x['low'] for x in seg]))
        midh = float(np.mean([x['midh'] for x in seg]))
        high = float(np.mean([x['high'] for x in seg]))
        kk = drums['kick']['count_series'][a:b]
        sn = drums['snare']['count_series'][a:b]
        ht = drums['hat']['count_series'][a:b]
        segs.append(dict(
            bar0=a, bar1=b, t0=round(float(seg[0]['t0']), 2), t1=round(float(seg[-1]['t1']), 2),
            dur=round(float(seg[-1]['t1'] - seg[0]['t0']), 2),
            rms_db=round(r, 1), density=round(den, 2), cen=round(cen, 0),
            low=round(low, 1), midh=round(midh, 1), high=round(high, 1),
            kick_pb=round(float(np.mean(kk)), 2), snare_pb=round(float(np.mean(sn)), 2),
            hat_pb=round(float(np.mean(ht)), 2),
            chords=chord_hist(seg),
            chroma=[round(float(v), 3) for v in np.mean([x['chroma'] for x in seg], 0)],
        ))
    return segs


if __name__ == '__main__':
    out = {}
    for nm in (sys.argv[1:] or list(D)):
        d = D[nm]
        x, sr = L5.load_mono(os.path.join(SRC, nm + '.mp3'))
        drums = drum_all(x, sr, d)
        bars = d['bars']
        bounds, nov = sections_of(d, bars)
        segs = summarize(d, bars, bounds, drums)
        out[nm] = dict(bpm=d['bpm'], bar_sec=d['bar_sec'], beat_offset=d['beat_offset'],
                       dur=d['dur'], drums=drums, sections=segs)
        print('=' * 110)
        print('%s  %.2fs  bpm %.3f  bar %.4fs  bars %d  off %.3f' %
              (nm, d['dur'], d['bpm'], d['bar_sec'], len(bars), d['beat_offset']))
        kk = d['key']
        print('  调性 KS: %s' % [(round(c['score'], 3), c['tonic'], c['mode'], round(c['ks'], 3)) for c in kk['candidates'][:5]])
        print('  色度: %s' % ' '.join('%s=%.2f' % (NAMES[i], v) for i, v in enumerate(kk['chroma'])))
        print('  低音: %s' % ' '.join('%s=%.2f' % (NAMES[i], v) for i, v in enumerate(kk['bass_hist'])))
        print('  和弦直方(小节级): %s' % chord_hist(bars))
        for k in ('kick', 'snare', 'hat'):
            v = drums[k]
            print('  %-5s n=%d pb=%.2f beat=%s hit16=%s' % (k, v['n'], v['per_bar'], v['beat_hist'], v['hit16']))
            print('        prof16=%s' % v['prof16'])
        print('  开镲比 %.2f  kick dt中位 %.3fs  <0.12s占 %.2f  四踩小节 %d(%.2f)' % (
            drums['open_hat_ratio'], drums.get('kick_dt_median', 0), drums.get('kick_dt_lt_012', 0),
            drums['four_on_floor_bars'], drums['four_on_floor_frac']))
        print('  边界 bars: %s' % bounds)
        for s in segs:
            print('   [%3d-%3d] %6.1f-%6.1f s %5.1fs rms %5.1f den %4.2f cen %5.0f  k%.1f s%.1f h%.1f  %s' % (
                s['bar0'], s['bar1'], s['t0'], s['t1'], s['dur'], s['rms_db'], s['density'],
                s['cen'], s['kick_pb'], s['snare_pb'], s['hat_pb'],
                ' '.join('%s×%d' % (c, n) for c, n in s['chords'][:6])))
    json.dump(out, open(os.path.join(HERE, '_ref7_sec.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('已写 _ref7_sec.json')
