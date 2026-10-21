# -*- coding: utf-8 -*-
import sys, os
import soundfile as sf, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
name = sys.argv[1] if len(sys.argv) > 1 else 'pre5_till_v01.wav'
L = float(sys.argv[2]) if len(sys.argv) > 2 else 105.290
x, sr = sf.read(os.path.join(base, name))
if x.ndim > 1: x = x.mean(1)
def rms(t0,t1): return float(np.sqrt((x[int(t0*sr):int(t1*sr)]**2).mean()))
print('%s  时长 %.2fs  峰 %.3f  总RMS %.3f' % (name, len(x)/sr, float(np.abs(x).max()), rms(0, len(x)/sr)))
a = x[int((L-0.05)*sr):int(L*sr)]; b = x[int(L*sr):int((L+0.05)*sr)]
print('循环点 %.3fs 样本跳变 %.4f / 相邻最大差 %.4f' % (L, abs(float(a[-1])-float(b[0])), float(np.abs(np.diff(np.concatenate([a,b]))).max())))
print('分段 RMS（每 8s）:', ' | '.join('%.0f-%.0f %.3f' % (t, t+8, rms(t, min(t+8, len(x)/sr))) for t in range(0, int(len(x)/sr), 8)))
# 前 4 秒细节
print('开头 0-1 %.3f | 1-2 %.3f | 2-3 %.3f | 3-4 %.3f | 4-6 %.3f' % (rms(0,1), rms(1,2), rms(2,3), rms(3,4), rms(4,6)))
# 频段
def band(seg):
    X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
    f = np.fft.rfftfreq(len(seg), 1.0/sr); tot = X.sum()+1e-12
    return [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))], round(float((f*X).sum()/tot))
seg = x[int(20*sr):int(100*sr)]
print('20-100s 频段', band(seg))
# 峰值密度：每秒过 0.5 峰值的样本簇
