# -*- coding: utf-8 -*-
"""_ref6_probe_chord2.py —— 修正版和弦/鼓探针
改动: (1) 和声色度只用 150-650Hz 中值谱（排除主旋律 690-1400Hz 干扰）
      (2) 用 refine_phase 找真正的第 1 拍相位
      (3) 鼓格用 max 归一 + 与段内中值比
"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L
from _ref6_sections import drum_env, grid_rate, chord_id, JP  # noqa

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'


def med_chroma_v2(y, sr, t0, t1, tuning=0.0, n_fft=4096, hop=512,
                  harm=(150.0, 650.0), root=(55.0, 220.0)):
    a = int(t0 * sr)
    b = min(len(y), int(t1 * sr))
    if b - a < n_fft:
        return np.zeros(12), -1
    n = 1 + (b - a - n_fft) // hop
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    fr = y[idx] * np.hanning(n_fft)[None, :]
    med = np.median(np.abs(np.fft.rfft(fr, axis=1)), axis=0)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    m = (freqs >= harm[0]) & (freqs <= harm[1])
    f = freqs[m]
    midi = 69.0 + 12.0 * np.log2(f / 440.0) - tuning / 100.0
    pc = np.mod(np.round(midi).astype(int), 12)
    keep = np.abs(midi - np.round(midi)) < 0.35
    v = np.zeros(12)
    for p in range(12):
        g = keep & (pc == p)
        if g.any():
            v[p] = float((med[m][g] ** 0.6).sum())

    m2 = (freqs >= root[0]) & (freqs <= root[1])
    f2, s2 = freqs[m2], med[m2]
    bpc = -1
    if len(s2) > 2:
        # 局部峰里取最强
        pk = [i for i in range(1, len(s2) - 1) if s2[i] >= s2[i - 1] and s2[i] >= s2[i + 1]]
        if pk:
            i = max(pk, key=lambda k: s2[k])
            bpc = int(round(69.0 + 12.0 * np.log2(f2[i] / 440.0) - tuning / 100.0)) % 12
    return v, bpc


def main(tag, path):
    raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), 'r', encoding='utf-8'))[tag]
    bpm = raw['tempo']['bpm']
    tuning = raw.get('tuning_cents', 0.0)
    bar = 4 * 60.0 / bpm
    y, sr = L.load_mono(path, SR)

    # 相位
    feat = L.frame_features(y, sr, n_fft=2048, hop=512, verbose=False)
    off, sc = L.refine_phase(feat, bpm)
    print('%s bpm=%.2f bar=%.3fs  phase_offset=%.3fs (score %.3f)' % (tag, bpm, bar, off, sc))

    print('\n和弦表 (每 2 小节, 和声 150-650Hz 中值谱 / 根音 55-220Hz 最低区域最强峰):')
    t = off
    rows = []
    while t + 2 * bar < len(y) / sr - 0.2:
        v, bpc = med_chroma_v2(y, sr, t, t + 2 * bar, tuning)
        r, q, nm, rom, s = chord_id(v, bpc)
        top = [(JP[i], round(float(v[i] / (v.sum() + 1e-9)), 2))
               for i in np.argsort(-v)[:4]]
        rows.append((t, nm, rom, JP[bpc] if bpc >= 0 else '?', top, s))
        t += 2 * bar
    for i in range(0, len(rows), 8):
        chunk = rows[i:i + 8]
        print('  %5.1fs ' % chunk[0][0] + ' | '.join(
            '%s(%s/%s)' % (c[1], c[2], c[3]) for c in chunk))
    print('\n详细前 10 格:')
    for c in rows[:10]:
        print('  %6.2fs %-7s %-5s bass=%-2s score=%.2f  top=%s' % (
            c[0], c[1], c[2], c[3], c[5], c[4]))

    # 鼓
    denv = drum_env(y, sr)
    dt = denv['times']
    print('\n鼓格 (16分格, 每格值/最大值; 段=8小节):')
    for k in range(0, int((len(y) / sr) // (8 * bar)) or 1):
        t0 = off + k * 8 * bar
        t1 = t0 + 8 * bar
        if t1 > len(y) / sr:
            break
        line = []
        for nm in ('kick', 'snare', 'hat'):
            g = grid_rate(denv[nm], dt, bpm, t0, t1)
            g = g / (g.max() + 1e-9)
            line.append('%s:%s' % (nm[0], ' '.join('%2d' % int(round(x * 9)) for x in g)))
        print('  %6.1fs  %s' % (t0, '  '.join(line)))


if __name__ == '__main__':
    tag = sys.argv[1] if len(sys.argv) > 1 else 'ref1'
    main(tag, os.path.join(REF, tag + '.mp3'))
