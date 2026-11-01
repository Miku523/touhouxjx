# -*- coding: utf-8 -*-
"""v1.6.70 混音测量：逐段 RMS、63-125Hz 相对能量、鼓密度、lead 首音/覆盖率。"""
import os, json, io, sys
import numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
KIT = os.path.join(ROOT, 'tools/build/_pret_kit')
BPM = {'pre1': 145.0, 'pre2': 151.0, 'pre3': 143.0, 'pre4': 163.0, 'pre6': 162.0}


def band_rel(x, sr, lo, hi):
    if len(x) < 4096:
        return -99.0
    seg = x[: len(x) // 4096 * 4096]
    X = np.fft.rfft(seg * np.hanning(len(seg)))
    f = np.fft.rfftfreq(len(seg), 1.0 / sr)
    tot = float(np.sum(np.abs(X) ** 2))
    m = (f >= lo) & (f < hi)
    return 10 * np.log10(max(float(np.sum(np.abs(X[m]) ** 2)), 1e-12) / max(tot, 1e-12))


for n in ('pre1', 'pre2', 'pre3', 'pre4', 'pre6'):
    p = os.path.join(KIT, n + '_v70_mono.wav')
    if not os.path.exists(p):
        print(n, 'MISSING'); continue
    x, sr = sf.read(p, always_2d=True)
    mono = x.mean(axis=1)
    song = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    secs = json.load(io.open(os.path.join(LEAD, n + '_secs.json'), encoding='utf-8'))['secs']
    peak = float(np.max(np.abs(mono)))
    rms = 20 * np.log10(max(float(np.sqrt(np.mean(mono ** 2))), 1e-9))
    print('==', n, '%.2fs' % (len(mono) / sr), 'peak %.4f' % peak, 'rms %.2f' % rms,
          '63-125 %.2f' % band_rel(mono, sr, 63, 125), '20-63 %.2f' % band_rel(mono, sr, 20, 63))
    for tag, a, b in secs:
        i0, i1 = int(a * sr), min(len(mono), int(b * sr))
        if i1 <= i0:
            continue
        seg = mono[i0:i1]
        r = 20 * np.log10(max(float(np.sqrt(np.mean(seg ** 2))), 1e-9))
        print('   %-9s %6.2f-%6.2f  rms %6.2f  lo40-250 %6.2f  mid %6.2f  hi %6.2f  63-125 %6.2f' % (
            tag, a, b, r, band_rel(seg, sr, 40, 250), band_rel(seg, sr, 300, 3000), band_rel(seg, sr, 4000, 12000),
            band_rel(seg, sr, 63, 125)))
    # lead 首音 / 覆盖率
    lead = [t['notes'] for t in song['tracks'] if t['name'] == 'lead'][0]
    ts = sorted(z[0] for z in lead)
    print('   lead notes', len(ts), 'first %.2f' % ts[0], 'last %.2f' % ts[-1])
    kinds = {}
    for z in song['drums']:
        kinds[z[1]] = kinds.get(z[1], 0) + 1
    print('   drums', len(song['drums']), 'kinds', dict(sorted(kinds.items())))
