# -*- coding: utf-8 -*-
"""_ref6_seg.py —— 阶段 B（最终版）：分段 / 和声 / 鼓型 / 旋律轮廓
用法: python _ref6_seg.py [ref1 ref3 ref5]
读 _ref6_feat/<tag>.npz + _ref6_raw.json + 原始 mp3；写 _ref6_sections.json 并打印可读摘要。
和声：160-650Hz 中值谱（避开 65Hz 底鼓与 690-1400 主旋律）→ 12 维色度；
      打印每 2 小节的猜测和弦 + 前 4 音级（原始测量值，供人工复核）。
鼓型：hop=128(5.8ms)，每格取 ±20ms 内 onset 包络最大，与该段中值相比 >1.35 记为强调格。
"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
BPM_FIX = {'ref1': 152.0, 'ref3': 155.9, 'ref5': 152.0}
KEY_ROOT = 5                                     # F minor
ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII']

TRI = {'maj': (0, 4, 7), 'min': (0, 3, 7), 'dim': (0, 3, 6)}
CAND = [(5, 'min'), (0, 'min'), (1, 'maj'), (3, 'maj'), (3, 'min'), (8, 'maj'),
        (8, 'min'), (10, 'maj'), (10, 'min'), (0, 'maj'), (5, 'maj'), (7, 'min'),
        (7, 'maj'), (6, 'maj'), (11, 'dim'), (1, 'min'), (2, 'min'), (2, 'maj'),
        (4, 'min'), (4, 'maj'), (9, 'min'), (6, 'min')]
PRIOR = {(5, 'min'): 0.020, (8, 'maj'): 0.016, (10, 'min'): 0.014, (0, 'min'): 0.012,
         (1, 'maj'): 0.010, (3, 'maj'): 0.008, (3, 'min'): 0.008, (8, 'min'): 0.004}


def nm(r, q):
    return JP[r] + {'maj': '', 'min': 'm', 'dim': 'dim'}[q]


def harm_chroma(y, sr, t0, t1, tuning=0.0, lo=160.0, hi=650.0, n_fft=4096, hop=512):
    a, b = int(t0 * sr), min(len(y), int(t1 * sr))
    if b - a < n_fft:
        return np.zeros(12)
    n = 1 + (b - a - n_fft) // hop
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    med = np.median(np.abs(np.fft.rfft(y[idx] * np.hanning(n_fft), axis=1)), axis=0)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    m = (freqs >= lo) & (freqs <= hi)
    f = freqs[m]
    midi = 69.0 + 12.0 * np.log2(f / 440.0) - tuning / 100.0
    pc = np.mod(np.round(midi).astype(int), 12)
    keep = np.abs(midi - np.round(midi)) < 0.5
    v = np.zeros(12)
    for p in range(12):
        g = keep & (pc == p)
        if g.any():
            v[p] = float((med[m][g] ** 0.7).sum())
    return v


def chord_id(v):
    if v.sum() <= 1e-9:
        return (-1, 'maj', 'N.C.', '-', 0.0)
    u = v / v.mean()
    best = (-9.0, None)
    for (r, q) in CAND:
        tones = [u[(r + i) % 12] for i in TRI[q]]
        outs = sorted([u[k] for k in range(12) if k not in [(r + i) % 12 for i in TRI[q]]],
                      reverse=True)
        s = float(np.mean(tones)) - 0.55 * float(np.mean(outs[:2])) + PRIOR.get((r, q), 0.0)
        if s > best[0]:
            best = (s, (r, q))
    r, q = best[1]
    return (r, q, nm(r, q), ROMAN[(r - KEY_ROOT) % 12], round(float(best[0]), 3))


def drum_env(y, sr, n_fft=1024, hop=128):
    n = 1 + (len(y) - n_fft) // hop
    w = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    masks = {'kick': (freqs >= 35) & (freqs <= 115),
             'snare': (freqs >= 700) & (freqs <= 3000),
             'hat': (freqs >= 4500) & (freqs <= 10000)}
    out = {k: np.empty(n, np.float32) for k in masks}
    prev = None
    for b0 in range(0, n, 4096):
        b1 = min(n, b0 + 4096)
        idx = np.arange(b0, b1)[:, None] * hop + np.arange(n_fft)[None, :]
        mag = np.abs(np.fft.rfft(y[idx] * w, axis=1))
        lm = np.log1p(mag * 15.0)
        d = np.empty_like(lm)
        d[0] = 0.0 if prev is None else np.maximum(lm[0] - prev, 0.0)
        d[1:] = np.maximum(lm[1:] - lm[:-1], 0.0)
        prev = lm[-1].copy()
        for k, mk in masks.items():
            out[k][b0:b1] = d[:, mk].sum(axis=1)
    out['times'] = ((np.arange(n) * hop) + n_fft / 2.0) / float(sr)
    return out


def grid_prof(env, times, bpm, off, t0, t1, n_bins=16, win=0.020):
    step = (60.0 / bpm) / (n_bins / 4.0)
    prof = np.zeros(n_bins)
    cnt = np.zeros(n_bins)
    t = off + np.ceil((t0 - off) / step) * step
    k = int(round((t - off) / step))
    while t < t1 - 1e-9:
        m = (times >= t - win) & (times <= t + win)
        if m.any():
            prof[k % n_bins] += float(env[m].max())
            cnt[k % n_bins] += 1
        t += step
        k += 1
    return prof / np.maximum(cnt, 1)


def melody_cells(npz, bpm, t0, t1, beats=2):
    ct = npz['times']
    hi = npz['chroma_hi'].astype(np.float64)
    pk = npz['peak_hi'].astype(np.float64)
    cell = beats * 60.0 / bpm
    out = []
    t = t0
    while t < t1 - 1e-6:
        m = (ct >= t) & (ct < t + cell)
        if m.sum() >= 2:
            v = hi[m].mean(axis=0)
            v = v / (v.sum() + 1e-9)
            p = int(np.argmax(v))
            f = float(np.median(pk[m]))
            out.append({'t': round(t, 2), 'pc': p, 'name': JP[p],
                        'reg': '高' if f > 1100 else ('中' if f > 620 else '低'),
                        'hz': round(f), 'conf': round(float(v[p]), 3)})
        t += cell
    return out


def analyse(tag):
    raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), encoding='utf-8'))[tag]
    bpm = BPM_FIX[tag]
    npz = np.load(os.path.join(HERE, '_ref6_feat', tag + '.npz'))
    ft, ct = npz['f_times'], npz['times']
    rms, bands, cent = npz['rms'], npz['bands'], npz['centroid']
    dur = float(npz['duration'])
    bar = 4 * 60.0 / bpm
    B = []
    for i in range(int((dur - 0.2) // bar)):
        t0, t1 = i * bar, (i + 1) * bar
        m = (ft >= t0) & (ft < t1)
        mc = (ct >= t0) & (ct < t1)
        if m.sum() < 2 or mc.sum() < 1:
            continue
        ch = npz['chroma'][mc].astype(np.float64)
        ch = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
        B.append({'i': i, 't0': t0, 't1': t1,
                  'rms_db': round(float(20 * np.log10(rms[m].mean() + 1e-9)), 2),
                  'centroid': round(float(cent[m].mean()), 1),
                  'bands': [round(float(x), 4) for x in bands[m].mean(axis=0)],
                  'chroma': [round(float(x), 4) for x in ch.mean(axis=0)]})
    nov = L.novelty(B, k=6)
    bnd = sorted(set([0] + [int(round(x / 4.0) * 4) for x in
                            L.pick_boundaries(nov, min_gap=8, k=6, rel=0.50)] + [len(B)]))
    keep = [bnd[0]]
    for b in bnd[1:]:
        if b - keep[-1] >= 6:
            keep.append(b)
    if keep[-1] != len(B):
        keep.append(len(B))
    secs = []
    for k in range(len(keep) - 1):
        a, b = keep[k], keep[k + 1]
        seg = B[a:b]
        secs.append({'idx': k, 'bar0': a, 'bar1': b, 'bars': b - a,
                     't0': round(a * bar, 2), 't1': round(b * bar, 2),
                     'rms_db': round(float(np.mean([s['rms_db'] for s in seg])), 2),
                     'centroid': round(float(np.mean([s['centroid'] for s in seg])), 1),
                     'bands': [round(float(x), 4) for x in np.mean([s['bands'] for s in seg], axis=0)],
                     'chroma': [round(float(x), 4) for x in np.mean([s['chroma'] for s in seg], axis=0)]})
    rd = [s['rms_db'] for s in secs]
    lo, hi = min(rd), max(rd)
    for s in secs:
        s['energy_lv'] = round((s['rms_db'] - lo) / (hi - lo + 1e-9), 2)
    return {'tag': tag, 'bpm': bpm, 'bar': round(bar, 3), 'dur': round(dur, 2),
            'tuning': raw.get('tuning_cents', 0.0), 'nbars': len(B), 'bars': B,
            'novelty': [round(float(x), 3) for x in nov], 'bounds': keep,
            'sections': secs}


def detail(tag, info):
    bpm = info['bpm']
    bar = 4 * 60.0 / bpm
    tun = info['tuning']
    y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
    npz = np.load(os.path.join(HERE, '_ref6_feat', tag + '.npz'))
    feat = L.frame_features(y, sr, n_fft=2048, hop=512, verbose=False)
    off, psc = L.refine_phase(feat, bpm)
    info['phase'] = round(off, 3)
    denv = drum_env(y, sr)
    dt = denv['times']
    print('\n' + '=' * 92)
    print('%s  bpm=%.2f  bar=%.3fs  dur=%.1fs  nbars=%d  phase=%.3fs  tuning=%+.0fc'
          % (tag, bpm, bar, info['dur'], info['nbars'], off, tun))
    print('=' * 92)
    print(' 段 小节      时间            小节 rms   质心  <120 120-500 500-2k 2-8k  >8k')
    for s in info['sections']:
        b = s['bands']
        print('%3d %3d-%-3d %6.1f-%6.1f  %3d %5.1f %5.0f   %2.0f%%  %4.0f%%  %3.0f%%  %3.0f%%  %2.0f%%' % (
            s['idx'], s['bar0'], s['bar1'], s['t0'], s['t1'], s['bars'],
            s['rms_db'], s['centroid'], b[0] * 100, b[1] * 100, b[2] * 100,
            b[3] * 100, b[4] * 100))
    for s in info['sections']:
        t0, t1 = s['t0'], s['t1']
        rows = []
        t = t0
        while t + 2 * bar <= t1 + 0.01:
            v = harm_chroma(y, sr, t, t + 2 * bar, tun)
            r, q, name, rom, sc = chord_id(v)
            rows.append((t, name, rom, [JP[i] for i in np.argsort(-v)[:4]]))
            t += 2 * bar
        s['chords'] = [{'t': round(a, 2), 'guess': b, 'roman': c, 'top': d}
                       for a, b, c, d in rows]
        hist = {}
        for a, b, c, d in rows:
            hist[b] = hist.get(b, 0) + 1
        s['chord_hist'] = sorted(hist.items(), key=lambda kv: -kv[1])
        print('\n[%d] %.1f-%.1f s (%d 小节) rms %.1f  质心 %.0f' % (
            s['idx'], t0, t1, s['bars'], s['rms_db'], s['centroid']))
        print('   和声 每2小节「猜测/前4音级」:')
        for i in range(0, len(rows), 4):
            print('     ' + ' | '.join('%5.1f %s %s' % (a, b, '/'.join(d)) for a, b, c, d in rows[i:i + 4]))
        print('   和弦频次: %s' % ', '.join('%s x%d' % kv for kv in s['chord_hist'][:6]))
        for k in ('kick', 'snare', 'hat'):
            r = grid_prof(denv[k], dt, bpm, off, t0, t1)
            med = float(np.median(r)) + 1e-9
            s[k + '_val'] = [round(float(x) / (r.max() + 1e-9), 2) for x in r]
            s[k + '_ratio'] = [round(float(x) / med, 2) for x in r]
            s[k + '_on'] = [i + 1 for i, x in enumerate(r) if x / med > 1.35]
        print('   鼓 16分格(1..16 = 每拍第1/2/3/4个十六分):')
        for k in ('kick', 'snare', 'hat'):
            print('     %-5s 值 %s' % (k, ' '.join('%4.2f' % x for x in s[k + '_val'])))
            print('     %-5s 比 %s' % ('', ' '.join('%4.1f' % x for x in s[k + '_ratio'])))
            print('     %-5s 强调格 %s' % ('', s[k + '_on']))
        cells = melody_cells(npz, bpm, t0, t1)
        s['melody'] = cells
        line = ['%s%s' % (c['name'], c['reg']) for c in cells]
        print('   旋律 每2拍(音级+音区 高>1100/中>620/低):')
        for i in range(0, len(line), 10):
            print('     ' + ' '.join('%-4s' % x for x in line[i:i + 10]))
    return info


if __name__ == '__main__':
    tags = sys.argv[1:] or ['ref1', 'ref3', 'ref5']
    out = {}
    for tag in tags:
        out[tag] = detail(tag, analyse(tag))
    with open(os.path.join(HERE, '_ref6_sections.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\n-> _ref6_sections.json')
