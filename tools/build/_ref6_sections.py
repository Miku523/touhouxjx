# -*- coding: utf-8 -*-
"""_ref6_sections.py —— 阶段 B：分段 / 和弦循环 / 鼓型 / 主旋律轮廓
用法: python _ref6_sections.py [ref1 ref3 ref5]
读 _ref6_feat/<tag>.npz + _ref6_raw.json + 原始 mp3
写 _ref6_sections.json，并打印可读摘要。
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

KEY_ROOT = 10                      # Bb
KEY_NAME = 'Bb minor'
ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII']

# 该风格常见和弦词表（根音 pc, 性质）——限制词表可显著降低误识
VOCAB = []
for r, q in ((10, 'min'), (10, 'maj'), (0, 'min'), (0, 'maj'), (1, 'maj'),
             (3, 'maj'), (3, 'min'), (5, 'min'), (5, 'maj'), (6, 'maj'),
             (7, 'min'), (7, 'maj'), (8, 'maj'), (8, 'min'), (9, 'min'),
             (11, 'maj'), (11, 'dim'), (2, 'min'), (2, 'maj'), (1, 'min')):
    VOCAB.append((r, q))
PRIOR = {(10, 'min'): 0.030, (8, 'maj'): 0.022, (3, 'maj'): 0.020,
         (1, 'maj'): 0.018, (5, 'min'): 0.014, (0, 'min'): 0.010,
         (7, 'maj'): 0.008, (3, 'min'): 0.004}
QUAL = ['maj', 'min', 'dim', 'm7b5']
BPM_FIX = {'ref1': 152.0, 'ref3': 155.9, 'ref5': 152.0}


def q_iv(q):
    return {'maj': (0, 4, 7), 'min': (0, 3, 7), 'dim': (0, 3, 6),
            'm7b5': (0, 3, 6, 10)}[q]


def name_of(r, q):
    return JP[r] + {'maj': '', 'min': 'm', 'dim': 'dim', 'm7b5': 'm7b5'}[q]


# ---------------------------------------------------------------- 和声色度
def harm_chroma(y, sr, t0, t1, tuning=0.0, lo=160.0, hi=650.0,
                n_fft=4096, hop=512):
    a = int(t0 * sr)
    b = min(len(y), int(t1 * sr))
    if b - a < n_fft:
        return np.zeros(12)
    n = 1 + (b - a - n_fft) // hop
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    fr = y[idx] * np.hanning(n_fft)[None, :]
    med = np.median(np.abs(np.fft.rfft(fr, axis=1)), axis=0)
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
    """限制词表 + 去均值互相关；返回 (root, qual, name, roman, score)"""
    if v.sum() <= 1e-9:
        return (-1, 'maj', 'N.C.', '-', 0.0)
    v = v / v.sum()
    best = (-9.0, None)
    for (r, q) in VOCAB:
        iv = q_iv(q)
        ins = np.mean([v[(r + i) % 12] for i in iv])
        outs = (1.0 - sum(v[(r + i) % 12] for i in iv)) / (12 - len(iv))
        s = ins - 0.85 * outs + PRIOR.get((r, q), 0.0)
        if s > best[0]:
            best = (s, (r, q))
    r, q = best[1]
    return (r, q, name_of(r, q), ROMAN[(r - KEY_ROOT) % 12], round(float(best[0]), 3))


# ---------------------------------------------------------------- 鼓
def drum_env(y, sr, n_fft=1024, hop=256):
    n_frames = 1 + (len(y) - n_fft) // hop
    window = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    masks = {
        'kick': (freqs >= 35) & (freqs <= 115),
        'snare': (freqs >= 700) & (freqs <= 3000),
        'hat': (freqs >= 4500) & (freqs <= 10000),
    }
    out = {k: np.empty(n_frames, np.float32) for k in masks}
    prev = None
    blk = 512
    for b0 in range(0, n_frames, blk):
        b1 = min(n_frames, b0 + blk)
        idx = np.arange(b0, b1)[:, None] * hop + np.arange(n_fft)[None, :]
        fr = y[idx] * window
        mag = np.abs(np.fft.rfft(fr, axis=1))
        lm = np.log1p(mag * 15.0)
        d = np.empty_like(lm)
        d[0] = 0.0 if prev is None else np.maximum(lm[0] - prev, 0.0)
        d[1:] = np.maximum(lm[1:] - lm[:-1], 0.0)
        prev = lm[-1].copy()
        for k, mk in masks.items():
            out[k][b0:b1] = d[:, mk].sum(axis=1)
    out['times'] = ((np.arange(n_frames) * hop) + n_fft / 2.0) / float(sr)
    return out


def grid_prof(env, times, bpm, off, t0, t1, n_bins=16):
    per = 60.0 / bpm
    step = per / (n_bins / 4.0)
    prof = np.zeros(n_bins)
    cnt = np.zeros(n_bins)
    # 找 t0 之后第一个网格点
    t = off + np.ceil((t0 - off) / step) * step
    k = int(round((t - off) / step))
    while t < t1 - 1e-9:
        m = (times >= t - 0.045) & (times <= t + 0.045)
        if m.any():
            prof[k % n_bins] += float(env[m].max())
            cnt[k % n_bins] += 1
        t += step
        k += 1
    r = prof / np.maximum(cnt, 1)
    med = float(np.median(r)) + 1e-9
    return r, r / med


# ---------------------------------------------------------------- 主旋律
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
            reg = '高' if f > 1100 else ('中' if f > 620 else '低')
            out.append({'t': round(t, 2), 'pc': p, 'name': JP[p], 'reg': reg,
                        'hz': round(f), 'conf': round(float(v[p]), 3)})
        t += cell
    return out


def melody_repeats(npz, bpm, t0, t1, span_bars=8, step_beats=8):
    """8 小节旋律指纹在两两之间最佳匹配 → 找主题重复与移调"""
    ct = npz['times']
    hi = npz['chroma_hi'].astype(np.float64)
    span = span_bars * 4 * 60.0 / bpm
    step = step_beats * 60.0 / bpm
    vs, ts = [], []
    t = t0
    while t + span < t1:
        m = (ct >= t) & (ct < t + span)
        if m.sum() > 8:
            v = hi[m].mean(axis=0)
            vs.append(v / (v.sum() + 1e-9))
            ts.append(round(t, 2))
        t += step
    if len(vs) < 3:
        return []
    V = np.array(vs)
    n = len(V)
    out = []
    for i in range(n):
        best = (-1.0, None, 0)
        for j in range(n):
            if abs(ts[j] - ts[i]) < span / 2:
                continue
            for sh in range(-6, 7):
                b = np.roll(V[j], -sh)
                s = float(V[i] @ b / (np.linalg.norm(V[i]) * np.linalg.norm(b) + 1e-9))
                if s > best[0]:
                    best = (s, j, sh)
        out.append({'t': ts[i], 'match_t': ts[best[1]], 'shift': best[2],
                    'sim': round(best[0], 3)})
    return out


# ---------------------------------------------------------------- 主流程
def analyse(tag):
    raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), 'r', encoding='utf-8'))[tag]
    bpm = BPM_FIX[tag]
    tuning = raw.get('tuning_cents', 0.0)
    npz = np.load(os.path.join(HERE, '_ref6_feat', tag + '.npz'))
    f_times, c_times = npz['f_times'], npz['times']
    rms, bands, centroid = npz['rms'], npz['bands'], npz['centroid']
    flux_low, flux_hi = npz['flux_low'], npz['flux_hi']
    dur = float(npz['duration'])
    bar = 1.579 if abs(bpm - 152) < 1 else 4 * 60.0 / bpm
    bar = 4 * 60.0 / bpm
    nb = int((dur - 0.2) // bar)

    B = []
    for i in range(nb):
        t0, t1 = i * bar, (i + 1) * bar
        m = (f_times >= t0) & (f_times < t1)
        mc = (c_times >= t0) & (c_times < t1)
        if m.sum() < 2 or mc.sum() < 1:
            continue
        ch = npz['chroma'][mc].astype(np.float64)
        ch = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
        B.append({
            'i': i, 't0': t0, 't1': t1,
            'rms_db': round(float(20 * np.log10(rms[m].mean() + 1e-9)), 2),
            'centroid': round(float(centroid[m].mean()), 1),
            'bands': [round(float(x), 4) for x in bands[m].mean(axis=0)],
            'chroma': [round(float(x), 4) for x in ch.mean(axis=0)],
            'flux_low': round(float(flux_low[m].mean()), 3),
            'flux_hi': round(float(flux_hi[m].mean()), 3),
        })

    nov = L.novelty(B, k=6)
    bnd = L.pick_boundaries(nov, min_gap=8, k=6, rel=0.50)
    bnd = sorted(set([0] + [int(round(x / 4.0) * 4) for x in bnd] + [len(B)]))
    bnd = [b for i, b in enumerate(bnd) if i == 0 or b > bnd[i - 1] + 7]
    if bnd[-1] != len(B):
        bnd.append(len(B))

    secs = []
    for k in range(len(bnd) - 1):
        a, b = bnd[k], bnd[k + 1]
        seg = B[a:b]
        secs.append({
            'idx': k, 'bar0': a, 'bar1': b, 'bars': b - a,
            't0': round(a * bar, 2), 't1': round(b * bar, 2),
            'sec': round((b - a) * bar, 2),
            'rms_db': round(float(np.mean([s['rms_db'] for s in seg])), 2),
            'centroid': round(float(np.mean([s['centroid'] for s in seg])), 1),
            'bands': [round(float(x), 4) for x in np.mean([s['bands'] for s in seg], axis=0)],
            'flux_low': round(float(np.mean([s['flux_low'] for s in seg])), 3),
            'flux_hi': round(float(np.mean([s['flux_hi'] for s in seg])), 3),
            'chroma': [round(float(x), 4) for x in np.mean([s['chroma'] for s in seg], axis=0)],
        })
    rd = [s['rms_db'] for s in secs]
    lo, hi = min(rd), max(rd)
    for s in secs:
        s['energy_lv'] = round((s['rms_db'] - lo) / (hi - lo + 1e-9), 2)
    for i, s in enumerate(secs):
        if i == 0:
            s['label'] = '前奏'
        elif i == len(secs) - 1:
            s['label'] = '尾奏'
        elif s['energy_lv'] >= 0.80 and s['bands'][3] >= 0.13:
            s['label'] = '高潮'
        elif s['energy_lv'] >= 0.62:
            s['label'] = '副歌'
        elif s['energy_lv'] <= 0.38:
            s['label'] = '主歌'
        else:
            s['label'] = '主题' if s['bars'] >= 16 else '间奏'
    return {'tag': tag, 'bpm': bpm, 'bar': round(bar, 3), 'dur': round(dur, 2),
            'tuning': tuning, 'nbars': len(B), 'bars': B,
            'novelty': [round(float(x), 3) for x in nov],
            'bounds': bnd, 'sections': secs}


def chords_drums_melody(tag, info):
    raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), 'r', encoding='utf-8'))[tag]
    bpm = BPM_FIX[tag]
    tuning = raw.get('tuning_cents', 0.0)
    bar = 4 * 60.0 / bpm
    y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
    npz = np.load(os.path.join(HERE, '_ref6_feat', tag + '.npz'))
    feat = L.frame_features(y, sr, n_fft=2048, hop=512, verbose=False)
    off, psc = L.refine_phase(feat, bpm)
    info['phase'] = round(off, 3)
    info['phase_score'] = round(psc, 3)
    denv = drum_env(y, sr)
    dt = denv['times']

    print('\n' + '=' * 78)
    print('%s  bpm=%.2f  bar=%.3fs  dur=%.1fs  phase=%.3fs' % (tag, bpm, bar, info['dur'], off))
    print('=' * 78)
    print(' 段 小节       时间           标签  小节 rms   质心   <120 120-500 500-2k 2-8k  >8k')
    for s in info['sections']:
        b = s['bands']
        print('%3d %3d-%-3d %6.1f-%6.1f %-4s %3d %5.1f %5.0f  %3.0f%% %5.0f%% %4.0f%% %4.0f%% %3.0f%%' % (
            s['idx'], s['bar0'], s['bar1'], s['t0'], s['t1'], s['label'], s['bars'],
            s['rms_db'], s['centroid'], b[0] * 100, b[1] * 100, b[2] * 100,
            b[3] * 100, b[4] * 100))

    for s in info['sections']:
        t0, t1 = s['t0'], s['t1']
        chords, t = [], t0
        while t + 2 * bar <= t1 + 0.01:
            v = harm_chroma(y, sr, t, t + 2 * bar, tuning)
            r, q, nm, rom, sc = chord_id(v)
            chords.append({'t': round(t, 2), 'name': nm, 'roman': rom, 'score': sc,
                           'top': [JP[i] for i in np.argsort(-v)[:5]]})
            t += 2 * bar
        seq = []
        for c in chords:
            if seq and seq[-1]['name'] == c['name']:
                seq[-1]['n'] += 1
            else:
                seq.append({'name': c['name'], 'roman': c['roman'], 'n': 1})
        s['chord_raw'] = chords
        s['chord_seq'] = seq
        hist = {}
        for c in chords:
            hist[c['name']] = hist.get(c['name'], 0) + 1
        s['chord_hist'] = sorted(hist.items(), key=lambda kv: -kv[1])[:6]
        print('\n[%d %s %6.1f-%6.1f] 和弦/2小节:' % (s['idx'], s['label'], t0, t1))
        print('   ' + ' '.join('%s%s%s' % (x['name'], '' if x['n'] == 1 else 'x%d' % x['n'],
                                           '.' + x['roman']) for x in seq))
        print('   频次: ' + ', '.join('%s x%d' % kv for kv in s['chord_hist']))

        for nm in ('kick', 'snare', 'hat'):
            r, ratio = grid_prof(denv[nm], dt, bpm, off, t0, t1)
            s[nm + '_grid'] = [round(float(x) / (r.max() + 1e-9), 3) for x in r]
            s[nm + '_ratio'] = [round(float(x), 2) for x in ratio]
        print('   鼓(值/max, 1 5 9 13 为四拍):')
        for nm in ('kick', 'snare', 'hat'):
            print('     %-5s %s' % (nm, ' '.join('%4.2f' % x for x in s[nm + '_grid'])))
        for nm in ('kick', 'snare', 'hat'):
            on = [i + 1 for i, x in enumerate(s[nm + '_ratio']) if x > 1.35]
            s[nm + '_on'] = on
            print('       %s 强调格: %s' % (nm, on))

        cont = melody_cells(npz, bpm, t0, t1)
        s['melody'] = cont
        line = ['%s%s' % (c['name'], c['reg']) for c in cont]
        print('   旋律 每半小节(音级+音区):')
        for i in range(0, len(line), 9):
            print('     ' + ' '.join('%-4s' % x for x in line[i:i + 9]))
    info['repeats'] = melody_repeats(npz, bpm, 0.0, info['dur'])
    print('\n 旋律 8 小节指纹重复（sim>0.85 显示）:')
    for r in info['repeats']:
        if r['sim'] > 0.85:
            print('   %6.1fs -> %6.1fs  shift=%+d  sim=%.3f' % (
                r['t'], r['match_t'], r['shift'], r['sim']))
    return info


if __name__ == '__main__':
    tags = sys.argv[1:] or ['ref1', 'ref3', 'ref5']
    out = {}
    for tag in tags:
        info = analyse(tag)
        info = chords_drums_melody(tag, info)
        out[tag] = info
    with open(os.path.join(HERE, '_ref6_sections.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\n-> _ref6_sections.json')
