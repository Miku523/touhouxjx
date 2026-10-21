# -*- coding: utf-8 -*-
"""竹取飛翔 融合稿 v2：先给游戏内原曲「测出真实的拍子时钟」，再在它上面铺新层。

为什么重写：游戏内 stage6 声明 bpm=128，但实测拍速在 152-154 之间漂移
（15 秒窗口内 16 分步长相干度 0.86-1.00，全曲却对不上同一条网格）。
直接按 128 铺新层就会「踩不到拍子上」。

做法：
  1. 用原曲贝斯轨（1059 个音，密到近似 16 分）反推「步号 → 时间」的单调时钟，
     间隔取局部中位数做单位，累加时四舍五入成整数步 —— 自动吸收速度漂移。
  2. 用底鼓落点定小节原点 b0（16 步 = 1 小节）。
  3. 新层（贝斯 / 铺底 / 月光琶音 / 鼓）全部写在这个时钟上，落拍与原曲一致。
  4. 原曲两条旋律轨逐音照搬，一个音、一个时值都不动。
"""
import json
import math
import os
import sys

import numpy as np

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage6.json'), encoding='utf-8'))
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'kaguya_stage6.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_kaguya_song.json')
DURATION = old['duration']

# ---------------------------------------------------------------- 1) 步号时钟
bass = np.array(sorted(t for (t, m, d, v) in old['tracks'][1]['notes']))
d = np.diff(bass)
units = np.zeros(len(d))
W = 15
for i in range(len(d)):
    lo, hi = max(0, i - W), min(len(d), i + W + 1)
    units[i] = float(np.median(d[lo:hi]))
units = np.clip(units, 0.090, 0.106)
steps_of = [0]
for i, di in enumerate(d):
    steps_of.append(steps_of[-1] + max(1, int(round(di / units[i]))))
steps_of = np.array(steps_of, dtype=float)
print('步号时钟：%d 个锚点，共 %d 步，平均步长 %.4fs' % (len(steps_of), steps_of[-1] + 1, (bass[-1] - bass[0]) / steps_of[-1]))


def t_of(idx):
    """步号 → 时间（线性插值，外推用两端斜率）。"""
    idx = np.asarray(idx, dtype=float)
    return np.interp(idx, steps_of, bass)


def idx_of(t):
    return np.interp(np.asarray(t, dtype=float), bass, steps_of)


# ---------------------------------------------------------------- 2) 小节原点
kicks = np.array(sorted(t for (t, k, v) in old['drums'] if k == 0))
kick_idx = np.round(idx_of(kicks) * 100) / 100
res = np.round(kick_idx) % 16
best_b0, best_score = 0, -1
for b0 in range(16):
    strong = sum(1 for r in res if (int(r) - b0) % 16 in (0, 8, 12, 4))
    if strong > best_score:
        best_b0, best_score = b0, strong
B0 = best_b0
print('小节原点 b0 = %d（底鼓 {0,4,8,12} 命中 %d/%d）' % (B0, best_score, len(res)))

BAR_STEPS = 16
TOTAL_STEPS = int(steps_of[-1]) + 1
NBARS = (TOTAL_STEPS - B0) // BAR_STEPS + 1


def time_of(b, s):
    return float(t_of(B0 + b * BAR_STEPS + s))


def dur_of(b0s, b1s):
    return max(0.03, time_of(b1s // BAR_STEPS, b1s % BAR_STEPS) - time_of(b0s // BAR_STEPS, b0s % BAR_STEPS))


# ---------------------------------------------------------------- 3) 段落（按秒）
DENS = []
for b in range(NBARS):
    t0, t1 = time_of(b, 0), time_of(b, 0) + 0.0
    t1 = float(t_of(B0 + (b + 1) * BAR_STEPS))
    n = sum(1 for tr in old['tracks'] for (t, m, dd, v) in tr['notes'] if t0 <= t < t1)
    dn = sum(1 for (t, k, v) in old['drums'] if t0 <= t < t1)
    DENS.append((b, t0, t1, n, dn))

print('\n逐小节密度（前 100 小节）：')
for (b, t0, t1, n, dn) in DENS[:100]:
    print('  bar%-3d %6.2fs 音符%3d 鼓%3d' % (b + 1, t0, n, dn))
