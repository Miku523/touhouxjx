# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
x, sr = sf.read(r'tools/build/pre1_honou_v3.wav', dtype='float32', always_2d=True)
x = x.mean(axis=1)
loop = 84.534
x = x[:int(loop*sr)]
hop = int(sr*0.010)
frames = len(x)//hop
env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
med = np.median(env)
low = env < med*0.12
# group consecutive low frames
runs = []
i = 0
while i < len(low):
    if low[i]:
        j = i
        while j < len(low) and low[j]: j += 1
        if j - i >= 2: runs.append((i*0.01, j*0.01))
        i = j
    else: i += 1
print('低电平段（>=20ms）数量 %d，总时长 %.2fs / %.2fs = %.1f%%' % (sum(b-a for a,b in runs)/0.01, sum(b-a for a,b in runs), loop, 100*sum(b-a for a,b in runs)/loop))
print('前 25 段：', ', '.join('%.2f-%.2f' % r for r in runs[:25]))
# 直方：每个 5 秒窗口的低电平占比
for s0 in range(0, int(loop), 5):
    a = int(s0/0.01); b = min(len(low), int((s0+5)/0.01))
    print('  %3d-%3ds 低电平 %4.1f%%  RMS %.4f' % (s0, s0+5, 100*low[a:b].mean(), env[a:b].mean()))
