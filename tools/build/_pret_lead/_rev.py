# -*- coding: utf-8 -*-
"""五首道中曲复盘测量：逐段 RMS / 低频占比 / 鼓密度 / 主旋律空窗 / 旋律重复。"""
import os, json, io, wave, glob
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
KIT = os.path.join(ROOT, 'tools/build/_pret_kit')
SONGS = ['pre1', 'pre2', 'pre3', 'pre4', 'pre6']

def load(p):
    x, sr = sf.read(p, always_2d=True)
    return x.astype(np.float64), sr

def rms_db(x):
    if x.size == 0:
        return -99.0
    return 20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-9))

def band_rel(x, sr, lo, hi):
    if len(x) < 2048:
        return -99.0
    X = np.fft.rfft(x.mean(axis=1) * np.hanning(len(x)))
    f = np.fft.rfftfreq(len(x), 1.0 / sr)
    tot = float(np.sum(np.abs(X) ** 2))
    m = (f >= lo) & (f < hi)
    return 10 * np.log10(max(float(np.sum(np.abs(X[m]) ** 2)), 1e-12) / max(tot, 1e-12))

for n in SONGS:
    sec = json.load(io.open(os.path.join(LEAD, n + '_secs.json'), encoding='utf-8'))
    segs = sec['secs']
    song = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    x, sr = load(os.path.join(KIT, n + '_stereo.wav'))
    print('=' * 12, n, 'dur', round(song['duration'], 3), 'bpm', song['bpm'])
    print('  whole mono-eq RMS %.2f dB  peak %.4f' % (rms_db(x) + 3.01, np.max(np.abs(x))))
    print('  63-125 rel %.2f dB   20-63 rel %.2f dB' % (band_rel(x, sr, 63, 125), band_rel(x, sr, 20, 63)))
    # per section
    tracks = {t['name']: t['notes'] for t in song['tracks']}
    lead = sorted(tracks.get('lead', []), key=lambda z: z[0])
    print('  %-8s %7s %7s %7s %6s %6s' % ('seg', 'rms', 'low63', 'mid', 'notes', 'drum/s'))
    for tag, a, b in segs:
        ia, ib = int(a * sr), min(int(b * sr), len(x))
        seg = x[ia:ib]
        nn = sum(1 for t in tracks.values() for z in t if a <= z[0] < b)
        nd = sum(1 for z in song['drums'] if a <= z[0] < b)
        dur = max(b - a, 1e-6)
        print('  %-8s %7.2f %7.2f %7.2f %6d %6.2f' % (tag, rms_db(seg) + 3.01, band_rel(seg, sr, 63, 125), band_rel(seg, sr, 300, 3000), nn, nd / dur))
    # lead gaps
    gaps = []
    for i in range(1, len(lead)):
        g = lead[i][0] - (lead[i - 1][0] + lead[i - 1][2])
        if g >= 1.2:
            gaps.append((round(lead[i - 1][0] + lead[i - 1][2], 2), round(g, 2)))
    if lead and lead[0][0] >= 1.5:
        gaps.insert(0, (0.0, round(lead[0][0], 2)))
    print('  lead gaps>=1.2s:', gaps[:10])
    # melody repetition between sections
    secnotes = {}
    for tag, a, b in segs:
        seq = [(round(z[0] - a, 2), z[1]) for z in lead if a <= z[0] < b]
        if len(seq) >= 20:
            secnotes[tag] = seq
    tags = list(secnotes)
    best = []
    for i in range(len(tags)):
        for j in range(i + 1, len(tags)):
            A = [m for _, m in secnotes[tags[i]]]
            B = [m for _, m in secnotes[tags[j]]]
            k = min(len(A), len(B))
            if k < 20:
                continue
            same = sum(1 for q in range(k) if A[q] == B[q])
            best.append((same / k, tags[i], tags[j], len(A), len(B)))
    best.sort(reverse=True)
    print('  melody repetition:')
    for r, ta, tb, la, lb in best[:3]:
        print('    %s vs %s  %.0f%%  (%d / %d notes)' % (ta, tb, r * 100, la, lb))
