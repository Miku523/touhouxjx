# -*- coding: utf-8 -*-
"""体检 tools/kaguya_stage6.py 的成品：分段响度、半音撞车、旋律覆盖和弦音比例。

用法: python tools/build/_kaguya_check.py
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WAV = os.path.join(ROOT, 'tools', 'build', 'kaguya_preview.wav')
BAR = 240.0 / 150.0

SECTIONS = [('intro', 0, 8), ('A', 8, 22), ('B', 22, 36), ('C', 36, 56),
            ('D', 56, 70), ('E', 70, 84), ('outro', 84, 92)]


def read_song():
    return json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_song.json'), encoding='utf-8'))


def main():
    x, sr = sf.read(WAV, always_2d=True)
    x = x.mean(axis=1)
    print('WAV %.2fs  峰值 %.3f  rms %.4f' % (len(x) / sr, np.abs(x).max(), np.sqrt((x ** 2).mean())))
    print('\n段落          小节    时长     rms    峰    鼓数')
    song = read_song()
    drums = song['drums']
    for name, b0, b1 in SECTIONS:
        t0, t1 = b0 * BAR, b1 * BAR
        seg = x[int(t0 * sr):int(t1 * sr)]
        n = sum(1 for d in drums if t0 <= d[0] < t1)
        print('  %-8s %3d-%-3d %6.1fs  %.4f  %.3f  %4d'
              % (name, b0, b1 - 1, t1 - t0, np.sqrt((seg ** 2).mean()), np.abs(seg).max(), n))

    # 半音撞车：把每轨量化到 16 分步，同一 0.1s 窗口内不同轨的音高差 1 个半音
    step = BAR / 16
    grid = {}
    trs = song['tracks'] if isinstance(song['tracks'], list) else list(song['tracks'].values())
    for ti, tr in enumerate(trs):
        for (t, m, d, v) in tr['notes']:
            s0 = int(round(t / step))
            s1 = max(s0 + 1, int(round((t + d) / step)))
            for s in range(s0, s1):
                grid.setdefault(s, {})
                grid[s].setdefault(ti, []).append(m)
    clash = tot = 0
    for s, d in grid.items():
        ks = sorted(d)
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                for a in d[ks[i]]:
                    for b in d[ks[j]]:
                        tot += 1
                        if abs(a - b) == 1 or abs(a - b) == 13:
                            clash += 1
    print('\n跨轨同时发声对 %d，半音撞车 %d (%.1f%%)' % (tot, clash, 100.0 * clash / max(1, tot)))

    # 低音区撞车
    low = lowc = 0
    for s, d in grid.items():
        for a in d.get(2, []):
            for ti in d:
                if ti == 2:
                    continue
                for b in d[ti]:
                    if b < 60:
                        low += 1
                        if abs(a - b) % 12 in (1, 11):
                            lowc += 1
    print('低音区(<B3)与其它声部同刻对 %d，半音撞车 %d' % (low, lowc))


if __name__ == '__main__':
    main()
