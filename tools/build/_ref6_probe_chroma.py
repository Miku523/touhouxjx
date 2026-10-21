# -*- coding: utf-8 -*-
"""_ref6_probe_chroma.py —— 高分辨率色度：调性 + 全曲和弦直方图（定调/定式）"""
import os
import sys
import collections

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

REFS = [('ref1', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref1.mp3', 0.0),
        ('ref3', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref3.mp3', -21.0),
        ('ref5', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref5.mp3', 0.0)]
SR = 22050


def profile(cp, band='chroma', t0=None, t1=None):
    t = cp['times']
    m = np.ones(len(t), bool)
    if t0 is not None:
        m &= t >= t0
    if t1 is not None:
        m &= t <= t1
    ch = cp[band][m].astype(np.float64)
    w = np.maximum(10 ** (cp['frame_db'][m].astype(np.float64) / 20.0), 1e-4)
    chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
    p = (chn * w[:, None]).sum(axis=0) / w.sum()
    return p / p.sum()


def ks_top(p, n=6):
    res = []
    for mode, tmpl in (('major', L.KS_MAJOR), ('minor', L.KS_MINOR),
                       ('dorian', L.KS_DORIAN)):
        t = tmpl / tmpl.sum()
        for root in range(12):
            tt = np.roll(t, root)
            a = p - p.mean(); b = tt - tt.mean()
            r = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
            res.append((r, L.NOTE_NAMES[root], mode))
    res.sort(key=lambda x: -x[0])
    return res[:n]


def chord_hist(cp, bpm, band='chroma', step_beats=2):
    t = cp['times']
    step = step_beats * 60.0 / bpm
    hist = collections.Counter()
    scores = collections.defaultdict(list)
    tt = 0.0
    while tt < t[-1]:
        m = (t >= tt) & (t < tt + step)
        if m.sum() >= 2:
            v = cp[band][m].astype(np.float64).mean(axis=0)
            r, q, name, sc, sec = L.chord_of(v)
            if sc > 0.75:
                hist[name] += 1
                scores[name].append(sc)
        tt += step
    return hist, scores


def main():
    for tag, path, tune in REFS:
        print('=' * 70)
        y, sr = L.load_mono(path, SR)
        cp = L.chroma_pass(y, sr, n_fft=8192, hop=1024, tuning_cents=tune)
        print(tag, 'tuning=%.0f cents  frames=%d' % (tune, len(cp['times'])))
        p = profile(cp, 'chroma')
        print('  chroma hist: %s' % [(L.NOTE_NAMES[i], round(float(p[i]), 3))
                                     for i in range(12)])
        print('  KS top: %s' % ['%s%s %.3f' % (r[1], r[2][:3], r[0]) for r in ks_top(p)])
        pm = profile(cp, 'chroma_mid')
        print('  mid hist : %s' % [(L.NOTE_NAMES[i], round(float(pm[i]), 3))
                                    for i in range(12)])
        print('  KS(mid)  : %s' % ['%s%s %.3f' % (r[1], r[2][:3], r[0]) for r in ks_top(pm)])

        bpm = {'ref1': 152.0, 'ref3': 156.0, 'ref5': 152.0}[tag]
        h, sc = chord_hist(cp, bpm)
        print('  chord hist top15 (2-beat windows, score>0.75):')
        for name, cnt in h.most_common(15):
            print('     %-7s x%-4d mean=%.2f' % (name, cnt, np.mean(sc[name])))


if __name__ == '__main__':
    main()
