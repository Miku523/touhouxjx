# -*- coding: utf-8 -*-
"""各轨独奏能量占比（复刻 WebAudio 参数渲染）。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import preview_song as P

SONG = os.path.join(ROOT, 'src', 'engine', 'songs', 'voyage_pre6.js')
song = P.load_song(SONG, 'VOYAGE_PRE6', 'pre6')
full = P.render(song, loops=1)
def band_rms(y, lo=250, hi=3000):
    Y = np.abs(np.fft.rfft(y))**2
    F = np.fft.rfftfreq(len(y), 1.0/P.SR)
    m = (F >= lo) & (F < hi)
    return np.sqrt(Y[m].sum()/ (len(y)**2))
print('整曲 RMS %.4f 带内(250-3000) %.4f' % (np.sqrt((full**2).mean()), band_rms(full)))
print('%-28s %8s %8s' % ('轨道', 'RMS', '带内'))
base = np.sqrt((full**2).mean()); baseb = band_rms(full)
for i, t in enumerate(song['tracks']):
    s2 = dict(song)
    s2['tracks'] = [dict(tt, gain=(tt['gain'] if j == i else 0.0)) for j, tt in enumerate(song['tracks'])]
    s2['drums'] = song['drums'] if False else []
    y = P.render(s2, loops=1)
    r = np.sqrt((y**2).mean()); rb = band_rms(y)
    print('%-3d %-10s gain %.3f  n=%-5d %8.4f %8.4f  (%.0f%% / %.0f%%)' % (
        i, t['wave'], t['gain'], len(t['notes']), r, rb, 100*r/base, 100*rb/baseb))
s2 = dict(song)
s2['tracks'] = [dict(tt, gain=0.0) for tt in song['tracks']]
y = P.render(s2, loops=1)
print('%-28s %8.4f %8.4f' % ('仅鼓', np.sqrt((y**2).mean()), band_rms(y)))
