# -*- coding: utf-8 -*-
import wave, numpy as np
def load(p):
    with wave.open(p,'rb') as w:
        n=w.getnframes(); sr=w.getframerate()
        x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float32)/32768.0
    if x.ndim>1: x=x.mean(axis=1)
    return x,sr
for p,l in [('tools/build/pre1_honou_v2.wav','pre1 v2'),('tools/build/boss5_mura_v15.wav','stage5 accepted')]:
    x,sr=load(p)
    d=np.abs(np.diff(x))
    print(l,'下采样跳变 p99.9 %.4f 最大 %.4f 超过0.25的样本数 %d' % (np.percentile(d,99.9), d.max(), int(np.sum(d>0.25))))
    # 找连续静音段（>40ms 且很安静）——判断是否有空档
    win=int(0.01*sr); n=len(x)//win
    rms=np.sqrt(np.array([np.mean(x[i*win:(i+1)*win]**2)+1e-12 for i in range(n)]))
    thr=0.02
    quiet=rms<thr
    # 连续 quiet 窗口长度
    runs=[]; c=0
    for q in quiet:
        if q: c+=1
        else:
            if c: runs.append(c)
            c=0
    runs=sorted(runs)
    print('   低于 %.2f RMS 的静音段数量 %d，最长 %d 窗(%.0fms)，>5窗(50ms)的段数 %d' % (
        thr, len(runs), runs[-1] if runs else 0, (runs[-1] if runs else 0)*10, sum(1 for r in runs if r>5)))
