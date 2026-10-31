# -*- coding: utf-8 -*-
"""《妖魔夜行（宵暗夜路编）》验收图 + 试听切片。"""
import os, json, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'tools', 'build', '_wrig_kit', 'wriggle_stage2_stereo.wav')
SEC = json.load(open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
SEC.setdefault('_dur', 116.129)

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

label = {'intro': '引子\n八音盒·夜雾', 'A': '原曲 A\nE 小调', 'A2': '原曲 A′\n加铜管',
         'B': '原曲 B\n降三度·抽鼓', 'B2': '原曲 B′\n全编制', 'outro': '原曲尾奏\nriff 回归',
         'break': '呼吸\n灯灭了', 'rep1': '再现 I\n主题加厚', 'rep2': '再现 II\n全奏', 'coda': '尾声\n八音盒·全奏收'}
for k, v in SEC.items():
    if k.startswith('_') or not isinstance(v, (list, tuple)):
        continue
    a0, a1 = v[0], v[1]
    for axi in (ax, ax2, ax3):
        axi.axvline(a0, color='w', lw=0.8, alpha=0.55)
    col = '#888888' if k in ('intro', 'coda', 'break') else ('#8899ff' if k == 'outro' else '#ffffff')
    ax.axvspan(a0, a1, alpha=0.10, color=col)
    ax.text((a0 + a1) / 2, -6.2, label.get(k, k), ha='center', va='bottom', fontsize=8.2, color='#222')
for axi in (ax, ax2, ax3):
    axi.set_xlim(0, SEC['_dur'])
fig.suptitle('《蠢蠢秋月 ～ Mooned Insect（萤火夜雾编）》 116.129s · 155BPM · E 小调 → C# 小调 —— 波形 / 声谱 / 频段能量', fontsize=12.5)
out = os.path.join(HERE, 'audition.png')
fig.savefig(out, bbox_inches='tight')
print('wrote', out)

# ---- 切片 ----
CLIPS = [
    ('01_引子夜雾八音盒', 0.0), ('02_原曲A_E小调', 9.29), ('03_原曲A2_加铜管', 23.226),
    ('04_原曲B_降三度', 35.613), ('05_原曲B2_全编制', 48.0), ('06_呼吸_灯灭了', 60.387),
    ('07_再现I主题加厚', 66.581), ('08_再现II全奏', 78.968), ('09_原曲尾奏riff', 91.355),
    ('10_尾声八音盒收', 103.742),
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
