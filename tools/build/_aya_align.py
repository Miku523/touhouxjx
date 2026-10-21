#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build/_aya_align.py —— 用色度对齐验证「我的旋律=refA 的哪一段」。

把 refA.mp3 按 154.5 BPM 切成 16 分格求色度（12 维），再把 MIDI 各通道
按同一网格求色度，逐段做互相关，找出每组旋律在 refA 里的对应位置。
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
REF = r'C:\Users\GuSheng\AppData\Local\Temp\aya_ref\refA.mp3'
SCORE = os.path.join(HERE, '_aya_score.json')
SR = 22050
HOP = 512
WIN = 4096
BPM = 154.5
BAR = 240.0 / BPM
STEP = BAR / 16


def audio_chroma():
    x, sr = sf.read(REF, dtype='float32')
    if x.ndim > 1:
        x = x.mean(1)
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype('float32')
    win = np.hanning(WIN).astype('float32')
    n = 1 + (len(x) - WIN) // HOP
    times = np.arange(n) * HOP / SR + WIN / 2 / SR
    f = np.fft.rfftfreq(WIN, 1 / SR)
    midi_bin = np.full(len(f), -1.0)
    ok = (f > 60) & (f < 4000)
    midi_bin[ok] = 69 + 12 * np.log2(f[ok] / 440.0)
    pc = np.round(midi_bin) % 12
    C = np.zeros((n, 12), 'float32')
    for i in range(n):
        seg = x[i * HOP: i * HOP + WIN] * win
        S = np.abs(np.fft.rfft(seg)) ** 1.5
        for k in range(12):
            m = (pc == k) & ok
            C[i, k] = S[m].sum()
    C /= np.maximum(C.sum(1, keepdims=True), 1e-9)
    return times, C


def note_chroma(notes, nbars, keys='melody'):
    """notes: [(bar, step, midi, len)] → (nbars*16, 12)"""
    G = np.zeros((nbars * 16, 12), 'float32')
    for b, si, m, ls in notes:
        t0 = b * 16 + si
        for k in range(t0, min(len(G), t0 + max(ls, 1))):
            G[k, m % 12] += 1.0
    return G


def notes_from_score(ch, b0, b1, top=True):
    d = json.load(open(SCORE, encoding='utf-8'))['ch']
    out = {}
    for b, si, m, ls, v in d.get(str(ch), []):
        if b0 <= b < b1:
            k = (b - b0, si)
            if k not in out or (top and m > out[k][2]):
                out[k] = (b - b0, si, m, ls)
    return list(out.values())


def similarity(audio_bar_major, G, bar0, nbars):
    """G 的 16 分格色度 vs 音频以 bar0 起 nbars 小节色度。"""
    A = audio_bar_major[bar0 * 16:(bar0 + nbars) * 16]
    g = G[:nbars * 16]
    if len(A) < len(g):
        return -1
    s = 0.0
    for i in range(0, len(g)):
        u, v = A[i], g[i]
        nu, nv = np.linalg.norm(u), np.linalg.norm(v)
        if nu > 0 and nv > 0:
            s += float(np.dot(u, v) / (nu * nv))
    return s / len(g)


if __name__ == '__main__':
    times, C = audio_chroma()
    # 重采样到 16 分格
    nsteps = int(times[-1] / STEP)
    grid = np.zeros((nsteps, 12), 'float32')
    idx = np.minimum((times / STEP).astype(int), nsteps - 1)
    cnt = np.zeros(nsteps)
    for i, k in enumerate(idx):
        grid[k] += C[i]
        cnt[k] += 1
    np.save(os.path.join(HERE, '_aya_ref_chroma.npy'), grid)
    print('refA 色度网格 %d 步 (%.1fs)' % (nsteps, times[-1]))

    tests = {
        'A段(ch0 28-44)': (0, 28, 44),
        'B段(ch0 53-68)': (0, 53, 68),
        '转调段(ch0 84-100)': (0, 84, 100),
        '开场riff(ch0 1-5)': (0, 1, 5),
        'ch6 9-13': (6, 9, 13),
        'ch2 5-21(和声)': (2, 5, 21),
    }
    for name, (ch, b0, b1) in tests.items():
        ns = notes_from_score(ch, b0, b1)
        nbars = b1 - b0
        G = note_chroma(ns, nbars)
        best = sorted(((similarity(grid, G, k, nbars), k) for k in range(0, 239 - nbars)),
                      reverse=True)[:3]
        print('%-22s 最像 refA 的 %d 小节窗口: %s' % (
            name, nbars, ', '.join('bar %d (%.3f)' % (k, s) for s, k in best)))
