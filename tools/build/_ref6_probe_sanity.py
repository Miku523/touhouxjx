# -*- coding: utf-8 -*-
"""_ref6_probe_sanity.py —— 管线自检（合成和弦）+ 调音浓度扫描 + 和弦随时间序列"""
import os
import sys
import collections

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050


def synth_chord(pcs, dur=2.0, sr=SR):
    t = np.arange(int(dur * sr)) / sr
    y = np.zeros_like(t)
    for pc in pcs:
        for midi in (pc + 48, pc + 60, pc + 72):
            f = 440.0 * 2 ** ((midi - 69) / 12.0)
            if f < sr / 2:
                y += 0.3 * np.sin(2 * np.pi * f * t)
    return (y / (np.abs(y).max() + 1e-9)).astype(np.float32)


def test_synth():
    print('## sanity: synthetic chords -> chroma')
    cases = {
        'Dm  (D F A)': [2, 5, 9],
        'Bbm (Bb Db F)': [10, 1, 5],
        'F   (F A C)': [5, 9, 0],
        'Am  (A C E)': [9, 0, 4],
    }
    for name, pcs in cases.items():
        y = synth_chord(pcs)
        cp = L.chroma_pass(y, SR)
        p = cp['chroma'].mean(axis=0)
        order = np.argsort(-p)[:4]
        print('  %-16s -> %s' % (name, [(L.NOTE_NAMES[i], round(float(p[i] / p.sum()), 3))
                                        for i in order]))
        r, q, cn, sc, _ = L.chord_of(cp['chroma'].mean(axis=0))
        print('      chord_of -> %s (%.3f)' % (cn, sc))


def tune_sweep(tag, path):
    print('\n## tuning sweep by chroma concentration:', tag)
    y, sr = L.load_mono(path, SR)
    best = (-1, 0)
    for c in range(-100, 101, 5):
        cp = L.chroma_pass(y[:sr * 60], sr, tuning_cents=c)
        p = cp['chroma'].mean(axis=0)
        p = p / p.sum()
        # 浓度：平方和（越大越集中）
        conc = float((p ** 2).sum())
        if conc > best[0]:
            best = (conc, c)
        if c % 20 == 0:
            print('   cents=%+4d  conc=%.5f  top=%s' % (
                c, conc, [L.NOTE_NAMES[i] for i in np.argsort(-p)[:4]]))
    print('   BEST cents=%+d conc=%.5f' % (best[1], best[0]))
    return best[1]


def chord_timeline(tag, path, bpm, cents=0.0, bars=2, dur=None):
    y, sr = L.load_mono(path, SR)
    cp = L.chroma_pass(y, sr, tuning_cents=cents)
    t = cp['times']
    bar = bars * 4 * 60.0 / bpm
    print('\n## %s chord timeline (every %d bars @ %.1f bpm)' % (tag, bars, bpm))
    tt = 0.0
    row = []
    while tt < t[-1]:
        m = (t >= tt) & (t < tt + bar)
        if m.sum() >= 2:
            v = cp['chroma'][m].astype(np.float64).mean(axis=0)
            r, q, name, sc, _ = L.chord_of(v)
            row.append('%6.1f:%s(%.2f)' % (tt, name, sc))
        tt += bar
        if len(row) == 8:
            print('   ' + ' '.join(row))
            row = []
    if row:
        print('   ' + ' '.join(row))


if __name__ == '__main__':
    test_synth()
    for tag, path, bpm in (('ref1', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref1.mp3', 152.0),
                           ('ref5', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref5.mp3', 152.0),
                           ('ref3', r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref\ref3.mp3', 156.0)):
        c = tune_sweep(tag, path)
        chord_timeline(tag, path, bpm, cents=c)
