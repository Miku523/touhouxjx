# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
name = sys.argv[1] if len(sys.argv) > 1 else 'pre4_fall_v22.wav'
L = float(sys.argv[2]) if len(sys.argv) > 2 else 64.776
x, sr = sf.read(os.path.join(base, name))
if x.ndim > 1: x = x.mean(1)
def rms(t0,t1): return float(np.sqrt((x[int(t0*sr):int(t1*sr)]**2).mean()))
print('%s  时长 %.2fs  峰 %.3f  RMS %.3f' % (name, len(x)/sr, float(np.abs(x).max()), rms(0, len(x)/sr)))
a = x[int((L-0.05)*sr):int(L*sr)]; b = x[int(L*sr):int((L+0.05)*sr)]
print('循环点 %.3fs 样本跳变 %.4f / 相邻最大差 %.4f' % (L, abs(float(a[-1])-float(b[0])), float(np.abs(np.diff(np.concatenate([a,b]))).max())))
print('前奏→主体 5.89s: 5.2-5.6 %.3f | 5.5-5.85 %.3f | 5.9-6.3 %.3f | 6.3-6.7 %.3f' % (rms(5.2,5.6), rms(5.5,5.85), rms(5.9,6.3), rms(6.3,6.7)))
print('段落 RMS: 0-2 %.3f | 2-4 %.3f | 4-5.8 %.3f | 8-12 %.3f | 20-24 %.3f | 30-34 %.3f | 40-44 %.3f | 52-54.5 %.3f | 58-62 %.3f | 62-64.7 %.3f'
      % (rms(0,2), rms(2,4), rms(4,5.8), rms(8,12), rms(20,24), rms(30,34), rms(40,44), rms(52,54.5), rms(58,62), rms(62,64.7)))
