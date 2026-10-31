# -*- coding: utf-8 -*-
"""《红月王座编》验收图：波形 / 声谱 / 三频段能量 + 段落标注。"""
import os, json, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'src', 'assets', 'bgm', 'remilia_septette.wav')
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
with wave.open(SRC) as w:
    sr = w.getframerate(); n = w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
t = np.arange(len(x)) / sr
names = {f.name for f in font_manager.fontManager.ttflist}
for f in ('Microsoft YaHei', 'SimHei', 'Noto Sans CJK SC', 'DejaVu Sans'):
    if f in names:
        plt.rcParams['font.family'] = f
        break
plt.rcParams['axes.unicode_minus'] = False
fig = plt.figure(figsize=(14.6, 8.6), dpi=100)
gs = fig.add_gridspec(3, 1, height_ratios=[1.0, 2.0, 1.0], hspace=0.22)

ax = fig.add_subplot(gs[0])
hop = 512
env = np.sqrt(np.convolve(x * x, np.ones(hop) / hop, mode='same'))[::hop]
te = np.arange(len(env)) * hop / sr
ax.plot(te, 20 * np.log10(np.maximum(env, 1e-9)), lw=0.6, color='#e86a86')
ax.set_ylim(-48, -4); ax.set_ylabel('RMS (dB)')

ax2 = fig.add_subplot(gs[1])
ax2.specgram(x, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=-120, vmax=-20)
ax2.set_ylim(0, 8000); ax2.set_ylabel('Hz')

ax3 = fig.add_subplot(gs[2])
def band(sig, lo, hi):
    F = np.fft.rfft(sig)
    fr = np.fft.rfftfreq(len(sig), 1 / sr)
    F[(fr < lo) | (fr >= hi)] = 0
    return np.fft.irfft(F, len(sig))
for lo, hi, c, lb in ((40, 250, '#6aa6ff', 'low 40-250Hz'), (300, 3000, '#5fd08a', 'mid 300-3kHz'), (4000, 12000, '#ffd166', 'high 4-12kHz')):
    y = band(x, lo, hi)
    e = np.sqrt(np.convolve(y * y, np.ones(hop) / hop, mode='same'))[::hop]
    ax3.plot(te, 20 * np.log10(np.maximum(e, 1e-9)), lw=0.7, color=c, label=lb)
ax3.set_ylim(-46, -4); ax3.legend(loc='lower right', fontsize=8); ax3.set_xlabel('sec')

names = {'intro': '引子\n管风琴钟', 'intro2': '引子II\n钢琴钟摆', 'A': 'A\n小号主题', 'vamp': '王座\n间奏',
         'A2': 'A2\n主题再现', 'A3': 'A3\n对答', 'B': 'B\n半音模进', 'C': 'C\n圣咏',
         'C2': 'C2\n圣咏再现', 'Final': '终曲\n全奏', 'Final2': '终曲II\n升调', 'outro': '尾声'}
W = 0.45
for k, _v in SEC.items():
    if k.startswith('_') or not isinstance(_v, (list, tuple)):
        continue
    a0, a1 = _v[0], _v[1]
    for axi in (ax, ax2, ax3):
        axi.axvline(a0, color='w', lw=0.8, alpha=0.55)
    ax.axvspan(a0, a1, alpha=0.10, color='#ff8899' if k in ('C', 'C2', 'Final', 'Final2') else ('#888888' if k in ('intro', 'intro2', 'outro') else '#ffffff'))
    if a1 - a0 > 3:
        ax.text((a0 + a1) / 2, -6.2, names.get(k, k), ha='center', va='bottom', fontsize=8.2, color='#222')
for axi in (ax, ax2, ax3):
    axi.set_xlim(0, SEC['_dur'])
fig.suptitle('《亡き王女の為のセプテット（红月王座编）》 148.66s · 145BPM · 降 B 小调 · 89 小节 —— 波形 / 声谱 / 频段能量', fontsize=12.5)
out = os.path.join(HERE, 'audition.png')
fig.savefig(out, bbox_inches='tight')
print('wrote', out)
