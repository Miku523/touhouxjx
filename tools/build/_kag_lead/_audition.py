# -*- coding: utf-8 -*-
"""《竹取飞翔（月之公主编）》验收图 + 试听切片。"""
import os, json, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SRC = os.path.join(ROOT, 'tools', 'build', '_kag_kit', 'kaguya_stage6_stereo.wav')
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
SEC.setdefault('_dur', 162.078)

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
ax.plot(te, 20 * np.log10(np.maximum(env, 1e-9)), lw=0.6, color='#8fe3ff')
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

label = {'intro': '引子\n八音盒', 'A1': '钢琴\n十六分跑句', 'B': '双小号\n主题',
         'break': '断句', 'C': '大键琴\n固定音型', 'riser': '上升',
         'C1': '主题陈述\n鼓抽空', 'C2': '鼓入', 'C3': '副歌\n高音区',
         'D1': '升半音\n鼓抽空', 'D2': '升半音副歌', 'outro': '原曲尾奏',
         'coda': '尾声\n八音盒'}
for k, v in SEC.items():
    if k.startswith('_') or not isinstance(v, (list, tuple)):
        continue
    a0, a1 = v[0], v[1]
    for axi in (ax, ax2, ax3):
        axi.axvline(a0, color='w', lw=0.8, alpha=0.55)
    col = '#888888' if k in ('intro', 'coda', 'outro', 'break', 'riser') else ('#8fe3ff' if k in ('C2', 'C3', 'D2') else '#ffffff')
    ax.axvspan(a0, a1, alpha=0.10, color=col)
    ax.text((a0 + a1) / 2, -6.2, label.get(k, k), ha='center', va='bottom', fontsize=7.6, color='#222')
for axi in (ax, ax2, ax3):
    axi.set_xlim(0, SEC['_dur'])
fig.suptitle('《竹取飞翔（月之公主编）》 162.1s · 154BPM · F 小调 → 降 B 小调 → 升半音(B 小调) —— 波形 / 声谱 / 频段能量', fontsize=12.5)
out = os.path.join(HERE, 'audition.png')
fig.savefig(out, bbox_inches='tight')
print('wrote', out)

CLIPS = [
    ('01_引子八音盒预告', 0.0), ('02_钢琴十六分跑句', 6.234), ('03_双小号主题', 26.494),
    ('04_断句', 51.429), ('05_大键琴固定音型', 54.545), ('06_上升', 79.481),
    ('07_主题陈述鼓抽空', 81.039), ('08_鼓入', 91.948), ('09_副歌高音区', 104.416),
    ('10_升半音鼓抽空', 116.883), ('11_升半音副歌', 129.351), ('12_原曲尾奏', 141.818),
    ('13_尾声八音盒', 155.844),
]
cdir = os.path.join(HERE, 'clips')
os.makedirs(cdir, exist_ok=True)
for nm, t0 in CLIPS:
    a = int(t0 * sr); b = min(len(x), a + int(9.6 * sr))
    seg = x[a:b]
    seg = seg[:len(seg) // 2 * 2].reshape(-1, 2).mean(axis=1)
    pcm = np.clip(seg * 32767.0, -32768, 32767).astype('<i2')
    p = os.path.join(cdir, nm + '.wav')
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes(pcm.tobytes())
    print(nm, p, len(pcm))
