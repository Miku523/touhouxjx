# -*- coding: utf-8 -*-
"""《妖魔夜行（宵暗夜路编）》验收图 + 试听切片。"""
import os, json, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'tools', 'build', '_rumia_kit', 'youma_stage1_stereo.wav')
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))

with wave.open(SRC) as w:
    sr = w.getframerate(); n = w.getnframes(); nch = w.getnchannels()
    x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
if nch > 1:
    x = x.reshape(-1, nch).mean(axis=1)
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
ax.plot(te, 20 * np.log10(np.maximum(env, 1e-9)), lw=0.6, color='#7fc6ff')
ax.set_ylim(-48, -4); ax.set_ylabel('RMS (dB)')

ax2 = fig.add_subplot(gs[1])
ax2.specgram(x, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=-120, vmax=-20)
ax2.set_ylim(0, 8000); ax2.set_ylabel('Hz')

ax3 = fig.add_subplot(gs[2])
def band(sig, lo, hi):
    F = np.fft.rfft(sig); fr = np.fft.rfftfreq(len(sig), 1 / sr)
    F[(fr < lo) | (fr >= hi)] = 0
    return np.fft.irfft(F, len(sig))
for lo, hi, c, lb in ((40, 250, '#6aa6ff', 'low 40-250Hz'), (300, 3000, '#5fd08a', 'mid 300-3kHz'), (4000, 12000, '#ffd166', 'high 4-12kHz')):
    y = band(x, lo, hi)
    e = np.sqrt(np.convolve(y * y, np.ones(hop) / hop, mode='same'))[::hop]
    ax3.plot(te, 20 * np.log10(np.maximum(e, 1e-9)), lw=0.7, color=c, label=lb)
ax3.set_ylim(-46, -4); ax3.legend(loc='lower right', fontsize=8); ax3.set_xlabel('sec')

label = {'intro': '引子\n八音盒·心跳', 'organ': '原曲 I\n风琴前奏', 'vibes': '铁琴\n过门',
         'theme': '主题\n长笛首现', 'theme2': '主题 II\n钢琴对句', 'bridge': '黑暗桥段\n声音被吃掉',
         'var1': '主题变奏\n八音盒高八度', 'var2': '变奏推进\n全奏', 'coda': '尾声\n回八音盒'}
for k, v in SEC.items():
    if k.startswith('_') or not isinstance(v, (list, tuple)):
        continue
    a0, a1 = v[0], v[1]
    for axi in (ax, ax2, ax3):
        axi.axvline(a0, color='w', lw=0.8, alpha=0.55)
    col = '#888888' if k in ('intro', 'coda') else ('#8899ff' if k in ('organ', 'vibes') else '#ffffff')
    ax.axvspan(a0, a1, alpha=0.10, color=col)
    ax.text((a0 + a1) / 2, -6.2, label.get(k, k), ha='center', va='bottom', fontsize=8.2, color='#222')
for axi in (ax, ax2, ax3):
    axi.set_xlim(0, SEC['_dur'])
fig.suptitle('《妖魔夜行（宵暗夜路编）》 112.998s · 146→144BPM · 降 E 小调 —— 波形 / 声谱 / 频段能量', fontsize=12.5)
out = os.path.join(HERE, 'audition.png')
fig.savefig(out, bbox_inches='tight')
print('wrote', out)

# ---- 切片 ----
CLIPS = [
    ('01_引子八音盒', 0.0), ('02_风琴前奏', 11.0), ('03_铁琴过门', 24.3), ('04_主题首现', 37.25),
    ('05_主题对句', 46.85), ('06_吉他切分', 55.2), ('07_黑暗桥段', 64.8), ('08_主题变奏', 74.8),
    ('09_变奏推进', 84.4), ('10_尾声回八音盒', 102.2),
]
cdir = os.path.join(HERE, 'clips')
os.makedirs(cdir, exist_ok=True)
for nm, t0 in CLIPS:
    a = int(t0 * sr); b = min(len(x), a + int(9.6 * sr))
    seg = x[a:b]
    # 44.1k -> 22.05k 单声道
    seg = seg[:len(seg) // 2 * 2].reshape(-1, 2).mean(axis=1)
    pcm = np.clip(seg * 32767.0, -32768, 32767).astype('<i2')
    p = os.path.join(cdir, nm + '.wav')
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes(pcm.tobytes())
    print(nm, p, len(pcm))
