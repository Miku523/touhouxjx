# -*- coding: utf-8 -*-
"""_ref6_probe_tempo.py —— 速度/调性/网格对齐的深入探查（只读缓存 npz）"""
import os
import sys
import math
import json

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
    d['hop'] = 512
    d['duration'] = float(d['times'][-1])
    return d


def local_bpm(feat, win=8.0, hop=4.0, use='flux'):
    """滑窗局部速度：每窗做 ACF + 谐波梳，取 60-200BPM。"""
    t = feat['times']
    env = L.onset_env(feat, use=use)
    out = []
    t0 = 0.0
    while t0 + win <= t[-1]:
        m = (t >= t0) & (t < t0 + win)
        e = env[m]
        if len(e) > 64 and e.max() > 1e-6:
            r = L.estimate_tempo({'flux': e, 'fps': feat['fps']}, 60, 200)
            out.append({'t': round(t0, 1), 'bpm': r['bpm'], 'conf': r['confidence'],
                        'alt': [c['bpm'] for c in r['bpm_candidates'][:2]]})
        t0 += hop
    return out


def acf_report(feat, use='flux', topn=10):
    env = L.onset_env(feat, use=use)
    ac = L._acf(env)
    fps = feat['fps']
    rows = []
    for Lg in range(8, len(ac) - 1):
        if ac[Lg] > ac[Lg - 1] and ac[Lg] >= ac[Lg + 1]:
            rows.append((Lg, float(ac[Lg]), 60.0 * fps / Lg))
    rows.sort(key=lambda x: -x[1])
    return [{'lag': r[0], 'acf': round(r[1], 4), 'bpm': round(r[2], 2)} for r in rows[:topn]]


def beat_strength(feat, bpm, phase):
    """每拍处 onset 值（用于检查网格是否踩在真正的拍点上）。"""
    env = L.onset_env(feat)
    times = feat['times']
    period = 60.0 / bpm
    pos = phase + period * np.arange(int((times[-1] - phase) / period) + 1)
    pos = pos[(pos > 0) & (pos < times[-1])]
    v = np.interp(pos, times, env)
    return float(v.mean()), float(np.percentile(v, 25)), float(v.std())


def scan_bpm(feat, bpms, phase_mode=True):
    """给一批候选 BPM，比较：拍点 onset 均值 + 16分网格对比度。"""
    env = L.onset_env(feat)
    times = feat['times']
    out = []
    for bpm in bpms:
        period = 60.0 / bpm
        best = (-1, 0)
        for k in range(24):
            ph = k * period / 24.0
            pos = ph + period * np.arange(int((times[-1] - ph) / period) + 1)
            pos = pos[(pos > 0) & (pos < times[-1])]
            v = np.interp(pos, times, env)
            sc = float(v.mean())
            if sc > best[0]:
                best = (sc, ph)
        sc, ph = best
        # 16 分网格对比度：偶数格（8分）vs 奇数格
        p16 = np.zeros(16)
        c16 = np.zeros(16)
        step = period / 4.0
        t_ = ph
        n = 0
        while t_ < times[-1]:
            m = (times >= t_ - 0.05) & (times <= t_ + 0.05)
            if m.sum():
                p16[n % 16] += env[m].max()
                c16[n % 16] += 1
            t_ += step
            n += 1
        p16 = p16 / np.maximum(c16, 1)
        even = p16[0::2].mean()
        odd = p16[1::2].mean()
        out.append({'bpm': round(bpm, 2), 'phase': round(ph, 4),
                    'beat_mean': round(sc, 4),
                    'sixteenth_contrast': round(float(even / (odd + 1e-9)), 3),
                    'p16': [round(float(x), 3) for x in (p16 / (p16.max() + 1e-9))]})
    out.sort(key=lambda x: -x['beat_mean'])
    return out


def main():
    for tag in TAGS:
        feat = load_feat(tag)
        print('=' * 78)
        print(tag, 'dur=%.1f' % feat['duration'])
        print('-- ACF(flux) top --')
        for r in acf_report(feat)[:8]:
            print('   lag=%4d acf=%.4f bpm=%.2f' % (r['lag'], r['acf'], r['bpm']))
        print('-- ACF(flux_low=底鼓) top --')
        for r in acf_report(feat, 'flux_low')[:6]:
            print('   lag=%4d acf=%.4f bpm=%.2f' % (r['lag'], r['acf'], r['bpm']))
        print('-- ACF(flux_hi=踩镲) top --')
        for r in acf_report(feat, 'flux_hi')[:6]:
            print('   lag=%4d acf=%.4f bpm=%.2f' % (r['lag'], r['acf'], r['bpm']))
        lb = local_bpm(feat)
        bpms = [x['bpm'] for x in lb]
        print('-- local bpm (8s/4s hop): n=%d median=%.2f  mode-ish=%s'
              % (len(bpms), float(np.median(bpms)) if bpms else 0,
                 np.round(np.percentile(bpms, [10, 50, 90]), 1).tolist() if bpms else []))
        print('   sample:', [(x['t'], x['bpm']) for x in lb[:12]])
        cand = sorted(set([round(x['bpm'], 1) for x in lb] + [152, 154, 76, 78, 103, 128, 146, 156, 160, 170]))
        cand = [c for c in cand if 60 <= c <= 200]
        print('-- scan candidates --')
        for r in scan_bpm(feat, cand)[:6]:
            print('   bpm=%7.2f phase=%.3f beat_mean=%.4f contrast=%.2f p16=%s'
                  % (r['bpm'], r['phase'], r['beat_mean'], r['sixteenth_contrast'],
                     [round(x, 2) for x in r['p16']]))


if __name__ == '__main__':
    main()
