# -*- coding: utf-8 -*-
"""tools/build/_pret_lead/_audition.py —— 五首道中曲通用验收图 + 试听切片
用法：python tools/build/_pret_lead/_audition.py <name> [stereo.wav]
读取 <name>_secs.json 的段落；标签表在 LABELS；
输出 tools/build/_pret_lead/<name>/audition.png 与 clips/ 下 10 个切片。
"""
import os, sys, json, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
name = sys.argv[1]
SRC = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'build', '_pret_kit', name + '_stereo.wav')
SEC = json.load(open(os.path.join(HERE, name + '_secs.json'), encoding='utf-8'))
dur = SEC.get('_dur', 100.0)
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}

META = {
    'pre1': dict(title='《ほおずきみたいに紅い魂（夜樱小径编）》', sub='92.7s · 145BPM · G 小调 · 夜樱小径',
                 labels={'intro': '引子\n夜樱', 'A0': '主题\n轻四拍', 'A': '主题\n小号', 'B': 'B\n圆号', 'C': 'C\n钢琴琶音',
                         'bridge': '桥段\n心跳', 'coda': '尾声\n全奏', 'tail': '回环\n回 Gm'},
                 clips=[('01_引子夜樱', 'intro'), ('02_主题轻四拍', 'A0'), ('03_主题小号', 'A'),
                        ('04_B圆号', 'B'), ('05_C钢琴琶音', 'C'), ('06_桥段心跳', 'bridge'),
                        ('07_尾声全奏', 'coda'), ('08_回环回Gm', 'tail')]),
    'pre2': dict(title='《幻視の夜 ～ Ghostly Eyes（萤火夜雾编）》', sub='111.3s · 151BPM · E 小调 → C# 小调 · 萤火夜雾',
                 labels={'intro': '引子\n夜雾萤火', 'A': 'A\n振翅双音', 'break': '呼吸\n灯灭了', 'C': 'C\n全编制', 'tail': '尾声\n回 C#m'},
                 clips=[('01_引子夜雾萤火', 'intro'), ('02_A振翅双音', 'A'), ('03_A中段', 'A'),
                        ('04_呼吸灯灭了', 'break'), ('05_C全编制', 'C'), ('06_尾声回C#m', 'tail')]),
    'pre3': dict(title='《ルーネイトエルフ（冰蓝晨曦编）》', sub='94.0s · 143BPM · E 大调 · 冰蓝晨曦',
                 labels={'intro': '引子\n冰晶', 'A1': 'A1\n长笛主题', 'A2': 'A2\n加厚', 'B1': 'B1\n十六分',
                         'B2': 'B2\n过渡', 'C': 'C\n降五度', 'coda': '尾声', 'tail': '收束'},
                 clips=[('01_引子冰晶', 'intro'), ('02_A1长笛主题', 'A1'), ('03_A2加厚', 'A2'),
                        ('04_B1十六分', 'B1'), ('05_B2过渡', 'B2'), ('06_C降五度', 'C'), ('07_尾声', 'coda')]),
    'pre4': dict(title='《フォールオブフォール ～ 秋めく滝（瀑布溪谷编）》', sub='123.7s · 163BPM · B 小调 · 瀑布溪谷',
                 labels={'intro': '引子\n水声', 'A1': 'A1\n三层 riff', 'A2': 'A2\n长笛主奏', 'B': 'B\n疏',
                         'C1': 'C1\n瀑布十六分', 'C2': 'C2\n全编制', 'D': 'D\n升五度 G#m', 'tail': '尾声\n水潭'},
                 clips=[('01_引子水声', 'intro'), ('02_A1三层riff', 'A1'), ('03_A2长笛主奏', 'A2'),
                        ('04_B疏', 'B'), ('05_C1瀑布十六分', 'C1'), ('06_C2全编制', 'C2'),
                        ('07_D升五度', 'D'), ('08_尾声水潭', 'tail')]),
    'pre6': dict(title='《ヴォヤージュ1970（月都航路编）》', sub='83.0s · 162BPM · D 小调（中段 3/4，尾段转 B）· 月都航路',
                 labels={'intro': '引子\n起飞', 'BODY': '原曲 3-58\n托卡塔 + 3/4 圆舞 + 转调', 'tail': '尾声\n降落 B 大调'},
                 clips=[('01_引子起飞', 'intro'), ('02_托卡塔', 'BODY'), ('03_A', 'BODY'), ('04_尾声降落', 'tail')]),
}

M = META[name]
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

for k, v in SEC.items():
    if k.startswith('_') or not isinstance(v, (list, tuple)):
        continue
    a0, a1 = v[0], v[1]
    for axi in (ax, ax2, ax3):
        axi.axvline(a0, color='w', lw=0.8, alpha=0.55)
    ax.axvspan(a0, a1, alpha=0.10, color='#8fe3ff')
    ax.text((a0 + a1) / 2, -6.2, M['labels'].get(k, k), ha='center', va='bottom', fontsize=7.4, color='#222')
for axi in (ax, ax2, ax3):
    axi.set_xlim(0, dur)
fig.suptitle(M['title'] + ' ' + M['sub'] + ' —— 波形 / 声谱 / 频段能量', fontsize=12.5)
out = os.path.join(HERE, 'audition_' + name + '.png')
fig.savefig(out, bbox_inches='tight')
print('wrote', out)

cdir = os.path.join(HERE, 'clips_' + name)
os.makedirs(cdir, exist_ok=True)
for nm, key in M['clips']:
    if key not in SEC:
        continue
    t0 = SEC[key][0]
    a = int(t0 * sr); b = min(len(x), a + int(9.6 * sr))
    seg = x[a:b]
    seg = seg[:len(seg) // 2 * 2].reshape(-1, 2).mean(axis=1)
    pcm = np.clip(seg * 32767.0, -32768, 32767).astype('<i2')
    p = os.path.join(cdir, nm + '.wav')
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes(pcm.tobytes())
    print(nm, p, len(pcm))
