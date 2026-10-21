# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
for name in ('pre4_fall_v19.wav', 'pre4_fall_v20.wav'):
    x, sr = sf.read(os.path.join(base, name))
    if x.ndim > 1: x = x.mean(1)
    L = 58.896
    def rms(t0, t1):
        return float(np.sqrt((x[int(t0*sr):int(t1*sr)]**2).mean()))
    print('==', name)
    print('   52.5-52.9 %.3f | 52.9-53.3 %.3f | 53.3-53.7 %.3f   (53s 换段)' % (rms(52.5,52.9), rms(52.9,53.3), rms(53.3,53.7)))
    print('   58.6-58.89 %.3f | 58.896-59.2 %.3f | 59.2-59.6 %.3f  (循环点)  跳变 %+.1f dB' % (
        rms(58.6,58.89), rms(L+0.001,L+0.3), rms(L+0.3,L+0.7),
        20*np.log10(rms(L+0.001,L+0.3)/max(rms(58.6,58.89),1e-9))))
    # 末 0.05s 与开头 0.05s 的波形差（点击检测）
    a = x[int((L-0.06)*sr):int(L*sr)]; b = x[int(L*sr):int((L+0.06)*sr)]
    print('   接缝处样本跳变 %.4f（相邻样本最大差 %.4f）' % (abs(float(a[-1])-float(b[0])), float(np.abs(np.diff(np.concatenate([a,b]))).max())))
