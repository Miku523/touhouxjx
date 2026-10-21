# -*- coding: utf-8 -*-
"""_ref6_probe_bpm3.py —— 谐波梳齿法精定 BPM（插值，无网格量化误差）"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'


def bands_env(y, sr, hop=128):
    n_fft = 1024
    n = 1 + (len(y) - n_fft) // hop
    w = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    mk = (freqs >= 30) & (freqs <= 120)
    out = np.empty(n, np.float32)
    prev = None
    for b0 in range(0, n, 2048):
        b1 = min(n, b0 + 2048)
        idx = np.arange(b0, b1)[:, None] * hop + np.arange(n_fft)[None, :]
        mag = np.abs(np.fft.rfft(y[idx] * w, axis=1))
        lm = np.log1p(mag * 15.0)
        d = np.empty_like(lm)
        d[0] = 0.0 if prev is None else np.maximum(lm[0] - prev, 0.0)
        d[1:] = np.maximum(lm[1:] - lm[:-1], 0.0)
        prev = lm[-1].copy()
        out[b0:b1] = d[:, mk].sum(axis=1)
    t = ((np.arange(n) * hop) + n_fft / 2.0) / float(sr)
    return out, t


def comb(env, t, P, t0=20.0):
    K = int((t[-1] - t0) / P)
    if K < 40:
        return 0.0
    pos = t0 + np.arange(K) * P
    v = np.interp(pos, t, env)
    return float(v.mean())


def main():
    for tag in ('ref1', 'ref3', 'ref5'):
        y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
        env, t = bands_env(y, sr)
        base = float(env.mean()) + 1e-9
        Ps = np.arange(0.26, 0.90, 0.0002)
        sc = np.array([comb(env, t, P) for P in Ps]) / base
        # 局部峰
        idx = [i for i in range(2, len(Ps) - 2)
               if sc[i] > sc[i - 1] and sc[i] >= sc[i + 1]]
        idx.sort(key=lambda i: -sc[i])
        picked = []
        for i in idx:
            if all(abs(Ps[i] - Ps[j]) > 0.02 for j in picked):
                picked.append(i)
            if len(picked) >= 6:
                break
        print('\n%s  (comb peaks on 30-120Hz kick env)' % tag)
        for i in picked:
            print('   P=%.4fs -> %6.2f BPM   score=%.3f  (x2=%.1f, /2=%.1f)' % (
                Ps[i], 60.0 / Ps[i], sc[i], 120.0 / Ps[i], 30.0 / Ps[i]))
        # 强制比较候选
        for bpm in (152.0, 154.0, 156.0, 156.6, 78.3, 76.0):
            P = 60.0 / bpm
            print('   [check] %.1f BPM  P=%.4f  score=%.3f' % (bpm, P, comb(env, t, P) / base))


main()
