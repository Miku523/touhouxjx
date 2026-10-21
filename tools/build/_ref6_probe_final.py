# -*- coding: utf-8 -*-
"""_ref6_probe_final.py —— 结尾/段落端点定主音：末 8 小节 + 首 8 小节的和声与旋律"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L
import _ref6_sections as S

SR = 22050
REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
JP = S.JP


def show(tag, t0, t1, note):
    raw = S.json.load(open(os.path.join(HERE, '_ref6_raw.json'), encoding='utf-8'))[tag]
    bpm = S.BPM_FIX[tag]
    tun = raw.get('tuning_cents', 0.0)
    y, sr = L.load_mono(os.path.join(REF, tag + '.mp3'), SR)
    bar = 4 * 60.0 / bpm
    npz = np.load(os.path.join(HERE, '_ref6_feat', tag + '.npz'))
    t0 = max(0.0, t1 - 8 * bar) if t0 is None else t0
    print('\n--- %s %s  %.1f-%.1f s (%.0f 小节)' % (tag, note, t0, t1, (t1 - t0) / bar))
    v = S.harm_chroma(y, sr, t0, t1, tun)
    p = v / v.sum()
    print('    和声色度 160-650Hz 前6: %s' % ', '.join(
        '%s %.3f' % (JP[i], p[i]) for i in np.argsort(-p)[:6]))
    # 极低频（贝斯基频区）中值谱
    a, b = int(t0 * sr), int(t1 * sr)
    n_fft, hop = 4096, 1024
    n = max(1, 1 + (b - a - n_fft) // hop)
    idx = a + np.arange(n)[:, None] * hop + np.arange(n_fft)[None, :]
    med = np.median(np.abs(np.fft.rfft(y[idx] * np.hanning(n_fft), axis=1)), axis=0)
    f = np.fft.rfftfreq(n_fft, 1.0 / sr)
    m = (f >= 95) & (f <= 400)
    j = np.argsort(-med[m])[:8]
    print('    低频中值谱 95-400Hz 前8峰: %s' % ', '.join(
        '%.0fHz(%s)' % (f[m][jj], JP[int(round(np.mod(69 + 12 * np.log2(f[m][jj] / 440.0), 12))) % 12])
        for jj in j))
    cells = S.melody_cells(npz, bpm, t0, t1)
    print('    旋律 每2拍: %s' % ' '.join('%s%s' % (c['name'], c['reg']) for c in cells))
    # 最后 2 拍 / 最后 4 拍的最强音
    if len(cells) >= 2:
        print('    末4拍: %s' % ' '.join('%s%s(%.2f)' % (c['name'], c['reg'], c['conf'])
                                        for c in cells[-2:]))


for tag in ('ref1', 'ref3', 'ref5'):
    raw = S.json.load(open(os.path.join(HERE, '_ref6_raw.json'), encoding='utf-8'))[tag]
    dur = raw['duration']
    show(tag, None, dur, '结尾')
    show(tag, 0.0, 8 * 4 * 60.0 / S.BPM_FIX[tag], '开头')
    show(tag, 25.3, 25.3 + 12 * 4 * 60.0 / S.BPM_FIX[tag], '主题段')
