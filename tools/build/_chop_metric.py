# -*- coding: utf-8 -*-
import wave, numpy as np
def load(p):
    with wave.open(p,'rb') as w:
        n=w.getnframes(); sr=w.getframerate()
        x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float32)/32768.0
    if x.ndim>1: x=x.mean(axis=1)
    return x,sr
def analyze(p, label):
    x,sr=load(p)
    x=x[:len(x)//sr*sr]
    win=int(0.02*sr)          # 20ms 窗
    n=len(x)//win
    rms=np.sqrt(np.array([np.mean(x[i*win:(i+1)*win]**2) for i in range(n)])+1e-12)
    med=np.median(rms); mean=rms.mean()
    # 瞬态密度：相邻窗能量比突增 2 倍以上的次数
    ratio=rms[1:]/np.maximum(rms[:-1],1e-9)
    jumps=int(np.sum(ratio>2.0))
    # 停顿率：窗 RMS < 中位数 30% 的比例（越低越断）
    dip=float(np.mean(rms<0.3*med))
    # 起伏：相邻窗 dB 变化均值
    db=20*np.log10(np.maximum(rms,1e-6))
    print('%-34s 峰 %.3f RMS %.4f 中位窗 %.4f 停顿率 %.1f%% 突增/秒 %.1f 相邻窗ΔdB均值 %.2f' % (
        label, np.max(np.abs(x)), np.sqrt(np.mean(x**2)), med, 100*dip, jumps/(len(x)/sr), np.mean(np.abs(np.diff(db)))))
for p,l in [('tools/build/pre1_honou_v3.wav','pre1 honou v3'),
            ('tools/build/stage1_youma_v3.wav','stage1 youma v3'),
            ('tools/build/boss5_mura_v15.wav','stage5 mura v15 (accepted)'),
            ('tools/build/stage3_ateam_v24.wav','stage3 atem v24 (accepted)')]:
    try: analyze(p,l)
    except Exception as e: print(p,'skip',e)
