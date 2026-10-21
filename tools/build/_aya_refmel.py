#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build/_aya_refmel.py —— 从 refA.mp3（酷狗第一首：ZUN 长版 風神少女）抽主旋律。

做法：STFT → 200-1600Hz 带内峰值跟踪（就近连续）→ 中值平滑 → 量化到 16 分网格 → 合并同音。
输出 tools/build/_aya_refmel.json：{bpm, bar, notes:[{bar, step, len, midi, hz}], 每小节谱}
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
REF = r'C:\Users\GuSheng\AppData\Local\Temp\aya_ref\refA.mp3'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_aya_refmel.json')

SR = 22050
HOP = 256          # 11.6ms
WIN = 2048
BPM = 154.5
BAR = 240.0 / BPM


def load():
    x, sr = sf.read(REF, dtype='float32')
    if x.ndim > 1:
        x = x.mean(1)
    if sr != SR:
        # 简单线性重采样
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype('float32')
    return x


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x)).astype('float32')


def melody_f0(x):
    """逐帧取旋律基频（Hz），返回 (times, f0)。"""
    xb = bandpass(x, 170, 1400)
    win = np.hanning(WIN).astype('float32')
    n = 1 + (len(xb) - WIN) // HOP
    prev = 0.0
    out = np.zeros(n, 'float32')
    for i in range(n):
        seg = xb[i * HOP: i * HOP + WIN] * win
        S = np.abs(np.fft.rfft(seg))
        f = np.fft.rfftfreq(WIN, 1 / SR)
        S[(f < 170) | (f > 1400)] = 0
        # 谐波显著度：基频 + 2f + 3f 之和
        best, bf = 0.0, 0.0
        for k in range(5, int(1400 / 170) + 1):
            pass
        idx = np.argsort(S)[::-1][:12]
        cand = []
        for j in idx:
            if S[j] <= 0:
                continue
            hz = f[j]
            if hz < 170:
                continue
            sc = S[j]
            for h in (2, 3):
                t = int(hz * h / (SR / WIN))
                if 0 < t < len(S):
                    sc += 0.6 * S[t - 1:t + 2].max()
            cand.append((sc, hz))
        if not cand:
            out[i] = prev
            continue
        cand.sort(reverse=True)
        # 就近选：优先靠前一个音的候选（±3 半音内）
        pick = cand[0][1]
        if prev > 0:
            near = [c for c in cand if abs(69 + 12 * np.log2(c[1] / 440) -
                                           (69 + 12 * np.log2(prev / 440))) < 3.5]
            if near:
                near.sort(key=lambda c: -c[0])
                pick = near[0][1]
        out[i] = pick
        prev = pick
    # midi + 中值平滑
    with np.errstate(divide='ignore'):
        midi = 69 + 12 * np.log2(out / 440.0)
    m = np.copy(midi)
    k = 7
    pad = np.pad(m, k // 2, mode='edge')
    sm = np.array([np.median(pad[i:i + k]) for i in range(len(m))], dtype='float32')
    return np.arange(n) * HOP / SR, sm


def to_notes(times, midi):
    """把逐帧音高压成音符：同音（±0.55 半音）连续 >= 4 帧算一个音。"""
    notes = []
    cur = None
    for t, m in zip(times, midi):
        if m < 40 or m > 108:
            if cur:
                notes.append(cur); cur = None
            continue
        if cur and abs(m - cur['m']) < 0.55:
            cur['end'] = t
            cur['ms'].append(m)
        else:
            if cur:
                notes.append(cur)
            cur = {'t0': t, 'end': t, 'm': m, 'ms': [m]}
    if cur:
        notes.append(cur)
    out = []
    for n in notes:
        if n['end'] - n['t0'] < 0.045:
            continue
        dur = n['end'] - n['t0'] + HOP / SR
        out.append({'t': n['t0'], 'dur': dur, 'midi': int(round(float(np.median(n['ms']))))})
    return out


def quantize(notes):
    q = []
    for n in notes:
        b = n['t'] / BAR
        bar = int(b)
        step = int(round((b - bar) * 16)) % 16
        lenst = max(1, int(round(n['dur'] / (BAR / 16))))
        q.append({'bar': bar, 'step': step, 'len': lenst, 'midi': n['midi'],
                  't': round(n['t'], 3)})
    # 同 bar/step 去重（留较长者）
    d = {}
    for n in q:
        k = (n['bar'], n['step'])
        if k not in d or n['len'] > d[k]['len']:
            d[k] = n
    return sorted(d.values(), key=lambda n: (n['bar'], n['step']))


if __name__ == '__main__':
    x = load()
    print('音频 %.1fs' % (len(x) / SR))
    times, midi = melody_f0(x)
    notes = quantize(to_notes(times, midi))
    print('音符 %d 个，覆盖到第 %d 小节' % (len(notes), max((n['bar'] for n in notes), default=0)))
    N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for b in range(0, 48):
        row = [n for n in notes if n['bar'] == b and n['step'] in range(0, 16)]
        if row:
            print('%3d' % b, ' '.join('%d:%s%d/%d' % (
                n['step'], N[n['midi'] % 12], n['midi'] // 12 - 1, n['len']) for n in row))
    json.dump({'bpm': BPM, 'notes': notes}, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('写入', OUT)
