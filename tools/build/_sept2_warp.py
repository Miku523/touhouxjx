# -*- coding: utf-8 -*-
"""DTW：把原曲(144.5)的色谱对齐到蓝图(194s)，看蓝图是不是同一首、哪几段是新增的、局部速度比"""
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'tools'))
import _ref5_lib as L

D = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
HOP = 4096.0 / 44100.0
def norm(A):
    return A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)

xs = {}
for tag, name in [('mel','sept_mel.mp3'), ('bp','sept_bp.mp3')]:
    x, sr = L.load_mono(os.path.join(D, name))
    (c, b), _ = L.chroma_frames(x, sr)
    xs[tag] = norm(c)

A = xs['mel']; B = xs['bp']
NA, NB = len(A), len(B)
# 代价矩阵（只要 C 形带，省内存）：用 1 - cos 相似
sim = A @ B.T  # (NA, NB)
cost = 1.0 - sim
print('帧 %d x %d' % (NA, NB))

INF = 1e9
Dp = np.full((NA + 1, NB + 1), INF, np.float32)
Dp[0, 0] = 0
bt = np.zeros((NA + 1, NB + 1), np.int8)
for i in range(1, NA + 1):
    ci = cost[i - 1]
    prev = Dp[i - 1]
    cur = Dp[i]
    for j in range(1, NB + 1):
        a = prev[j - 1]; b = prev[j]; c = cur[j - 1]
        if a <= b and a <= c:
            cur[j] = ci[j - 1] + a; bt[i, j] = 0
        elif b <= c:
            cur[j] = ci[j - 1] + b; bt[i, j] = 1
        else:
            cur[j] = ci[j - 1] + c; bt[i, j] = 2
# 回溯
i, j = NA, NB
path = []
while i > 0 and j > 0:
    path.append((i - 1, j - 1))
    k = bt[i, j]
    if k == 0: i -= 1; j -= 1
    elif k == 1: i -= 1
    else: j -= 1
path.reverse()
pa = np.array([p[0] for p in path]); pb = np.array([p[1] for p in path])
print('路径长度', len(path), ' 对角率 %.2f' % (np.mean(np.diff(pa[np.r_[0, np.where(np.diff(pa))[0]+1]]) == 1) if len(path) > 2 else 0))
print('总代价/帧 %.3f' % (Dp[NA, NB] / len(path)))
# 每 5s 原曲对应蓝图哪一段
for k in range(0, int(NA * HOP), 5):
    f = int(k / HOP)
    idx = np.searchsorted(pa, f)
    if idx >= len(pa): break
    print('  原曲 %5.1fs -> 蓝图 %5.1fs' % (k, pb[idx] * HOP))
# 局部斜率：每 10s 一段
print('局部速度比（蓝图秒/原曲秒）：')
for k in range(0, int(NA * HOP) - 12, 10):
    f0 = int(k / HOP); f1 = int((k + 10) / HOP)
    i0 = np.searchsorted(pa, f0); i1 = np.searchsorted(pa, f1)
    if i1 <= i0: continue
    print('  %5.1f-%5.1fs  %.3f' % (k, k + 10, (pb[i1] - pb[i0]) * HOP / ((pa[i1] - pa[i0]) * HOP)))
