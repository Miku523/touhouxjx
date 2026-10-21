# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
x, sr = sf.read(os.path.join(base, 'pre4_fall_v21.wav'))
if x.ndim > 1: x = x.mean(1)
L = 64.776   # 44 小节 * 1.4724
def rms(t0,t1): return float(np.sqrt((x[int(t0*sr):int(t1*sr)]**2).mean()))
print('循环点 %.3fs' % L)
print('  63.8-64.4 %.3f | 64.4-64.77 %.3f | 64.78-65.2 %.3f | 65.2-65.8 %.3f' % (rms(63.8,64.4), rms(64.4,L), rms(L,L+0.42), rms(L+0.42,L+1.0)))
a = x[int((L-0.05)*sr):int(L*sr)]; b = x[int(L*sr):int((L+0.05)*sr)]
print('  接缝样本跳变 %.4f，相邻最大差 %.4f' % (abs(float(a[-1])-float(b[0])), float(np.abs(np.diff(np.concatenate([a,b]))).max())))
print('前奏→主体 5.89s: 5.4-5.85 %.3f | 5.9-6.3 %.3f' % (rms(5.4,5.85), rms(5.9,6.3)))
print('53 秒附近（现在是连续乐句）: 52.5-53.0 %.3f | 53.0-53.5 %.3f | 53.5-54.0 %.3f | 54.0-54.5 %.3f'
      % (rms(52.5,53.0), rms(53.0,53.5), rms(53.5,54.0), rms(54.0,54.5)))
