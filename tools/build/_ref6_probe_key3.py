# -*- coding: utf-8 -*-
"""_ref6_probe_key3.py —— 用「旋律音级直方图」（无和声涂抹）做 KS 调性判定 + 与游戏 MIDI 对比"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def melody_hist(y, sr, tuning=0.0, lo=600.0, hi=2100.0):
    """时长加权的主旋律音级直方图（沿用 _ref6_probe_key2.py 的 peak-following 法）"""
    n_fft, hop = 4096, 1024
    n = 1 + (len(y) - n_fft) // hop
    freqs = np.fft.rfftfreq(n_fft, 1.0 / SR)
    m = (freqs >= lo) & (freqs <= hi)
    f = freqs[m]
    midi = 69.0 + 12.0 * np.log2(f / 440.0) - tuning / 100.0
    pc = np.mod(np.round(midi).astype(int), 12)
    keep = np.abs(midi - np.round(midi)) < 0.5
    w = np.hanning(n_fft)
    hist = np.zeros(12)
    prev = None
    for b0 in range(0, n, 4096):
        b1 = min(n, b0 + 4096)
        idx = np.arange(b0, b1)[:, None] * hop + np.arange(n_fft)[None, :]
        mag = np.abs(np.fft.rfft(y[idx] * w, axis=1))
        lm = np.log1p(mag * 30.0)[:, m]
        for r in range(lm.shape[0]):
            row = lm[r]
            # 局部峰
            pk = np.where((row[1:-1] > row[:-2]) & (row[1:-1] >= row[2:]))[0] + 1
            if len(pk) == 0:
                continue
            pk = pk[keep[pk]] if keep[pk].any() else pk
            if len(pk) == 0:
                continue
            v = row[pk]
            j = pk[int(np.argmax(v))]
            if prev is not None:
                # 连续性：在 ±7 半音内取峰
                cand = [k for k in pk if abs(midi[k] - prev) <= 7]
                if cand:
                    j = max(cand, key=lambda k: row[k])
            prev = midi[j]
            if keep[j]:
                hist[pc[j]] += 1.0
    s = hist.sum()
    return hist / s if s > 0 else hist


def ks(p):
    p = p - p.mean()
    out = []
    for r in range(12):
        for nm, prof in (('maj', MAJ), ('min', MIN)):
            pr = np.roll(prof, r)
            out.append((float(np.corrcoef(p, pr - pr.mean())[0, 1]), JP[r] + ('maj' if nm == 'maj' else 'min')))
    out.sort(reverse=True)
    return out


def main():
    game = json.load(open(os.path.join(HERE, '_ref6_game_pc.json'), encoding='utf-8'))
    gm = np.array(game['t0'])
    print('## 游戏内 stage6 MIDI（主旋律轨）音级分布与 KS')
    print('   %s' % ' '.join('%s:%.3f' % (JP[i], gm[i]) for i in np.argsort(-gm)))
    for s, n in ks(gm)[:4]:
        print('   %-6s r=%+.3f' % (n, s))

    hs = {}
    for tag in ('ref1', 'ref3', 'ref5'):
        raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), encoding='utf-8'))[tag]
        tun = raw.get('tuning_cents', 0.0)
        y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
        h = melody_hist(y, sr, tun)
        hs[tag] = h
        print('\n## %s 旋律音级分布（时长加权）' % tag)
        print('   %s' % ' '.join('%s:%.3f' % (JP[i], h[i]) for i in np.argsort(-h)))
        for s, n in ks(h)[:5]:
            print('   %-6s r=%+.3f' % (n, s))
        print('   与游戏 MIDI 最佳移调:')
        for sh in range(12):
            c = float(np.corrcoef(h, np.roll(gm, sh))[0, 1])
            if sh in (0, 5, 7) or c > 0.9:
                print('      shift=%+2d  r=%+.3f' % (sh, c))
        best = max(range(12), key=lambda sh: np.corrcoef(h, np.roll(gm, sh))[0, 1])
        print('      BEST shift=%+d r=%+.3f' % (best, np.corrcoef(h, np.roll(gm, best))[0, 1]))
    json.dump({k: [round(float(x), 4) for x in v] for k, v in hs.items()},
              open(os.path.join(HERE, '_ref6_melody_pc.json'), 'w'), indent=1)


main()
