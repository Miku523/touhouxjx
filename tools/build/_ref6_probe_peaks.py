# -*- coding: utf-8 -*-
"""_ref6_probe_peaks.py —— 直接看谱峰（不经过色度），确认绝对音高 / 调性
   输出：若干时间窗的 top 谱峰频率→音名、bass 色度直方图、每 2 小节低频根音、结尾和声
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

REF = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
SR = 22050
NOTE = L.NOTE_NAMES


def hz_name(f):
    m = 69 + 12 * np.log2(f / 440.0)
    return '%s%d' % (NOTE[int(round(m)) % 12], int(round(m)) // 12 - 1)


def peaks(y, sr, t0, t1, n=6, fmin=60, fmax=4000, step=0.25):
    print('\n  --- %.1f-%.1f s ---' % (t0, t1))
    tt = t0
    while tt < t1:
        a = int(tt * sr)
        b = a + 8192
        if b > len(y):
            break
        seg = y[a:b] * np.hanning(8192)
        sp = np.abs(np.fft.rfft(seg))
        fr = np.fft.rfftfreq(8192, 1.0 / sr)
        m = (fr >= fmin) & (fr <= fmax)
        idx = np.argsort(-sp * m)[:n]
        # 只保留局部峰
        out = []
        for i in idx:
            if 0 < i < len(sp) - 1 and sp[i] >= sp[i - 1] and sp[i] >= sp[i + 1]:
                out.append((float(sp[i]), float(fr[i])))
        out.sort(reverse=True)
        sel = out[:4]
        print('   %6.2fs  %s' % (tt, '  '.join('%s(%4.0fHz a=%.2f)' % (
            hz_name(f), f, a / (out[0][0] + 1e-9)) for a, f in sel)))
        tt += step


def bass_info(tag, path, bpm):
    y, sr = L.load_mono(path, SR)
    cp = L.chroma_pass(y, sr)
    b = cp['chroma_bass'].mean(axis=0)
    b = b / b.sum()
    print('\n## %s bass chroma hist (<260Hz, 8192FFT)' % tag)
    for i in np.argsort(-b)[:8]:
        print('   %-3s %.3f' % (NOTE[i], b[i]))
    bar2 = 8 * 60.0 / bpm
    t = cp['times']
    print('  %s 2-bar bass root:' % tag)
    row = []
    tt = 0.0
    while tt < t[-1] - bar2:
        m = (t >= tt) & (t < tt + bar2)
        if m.sum() > 4:
            v = cp['chroma_bass'][m].mean(axis=0)
            i = int(np.argmax(v))
            row.append('%s' % NOTE[i])
        tt += bar2
        if len(row) == 24:
            print('   ' + ' '.join(row))
            row = []
    if row:
        print('   ' + ' '.join(row))
    # 结尾
    h = cp['chroma'][t >= t[-1] - 8].mean(axis=0)
    tot = h.sum()
    print('  last 8s chroma: %s' % [(NOTE[i], round(float(h[i] / tot), 3))
                                    for i in np.argsort(-h)[:6]])


if __name__ == '__main__':
    for tag, bpm in (('ref1', 152.0), ('ref5', 152.0), ('ref3', 156.0)):
        path = os.path.join(REF, tag + '.mp3')
        y, sr = L.load_mono(path, SR)
        print('\n===== %s =====' % tag)
        print(' duration=%.2fs' % (len(y) / sr))
        peaks(y, sr, 0.0, 8.0)
        peaks(y, sr, (len(y) / sr) - 6.0, len(y) / sr)
        del y
        bass_info(tag, path, bpm)
