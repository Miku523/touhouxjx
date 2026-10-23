# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def prof(name, p, loop=None):
    x, sr = sf.read(p, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    if loop: x = x[:int(loop*sr)]
    dur = len(x)/sr
    hop = int(sr*0.010); frames = len(x)//hop
    env = np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)+1e-12) for i in range(frames)])
    med = np.median(env)
    gap = float(np.mean(env < med*0.12))
    # 起音尖锐度：10ms 内 RMS 上升 >8dB 的次数
    db = 20*np.log10(env+1e-9)
    jumps = int(np.sum(np.diff(db) > 8))
    print('%-12s dur %6.2fs  RMS %.4f  空隙率 %4.1f%%  陡起音 %5.2f/s' % (name, dur, float(np.sqrt(np.mean(x**2))), gap*100, jumps/dur))
prof('pre1 v4', r'tools/build/pre1_honou_v4.wav', 84.534)
prof('stage1 v3', r'tools/build/stage1_youma_v3.wav', 39.252)
for f,d in [('ateam_stage3_v24.wav',101.722),('boss5',0)]:
    pass
import glob
for p in ['tools/build/stage3_ateam_v24.wav','tools/build/boss5_mura_v15.wav']:
    try:
        x, sr = sf.read(p, dtype='float32', always_2d=True); d=len(x)/sr
        prof(p.split('/')[-1], p, None)
    except Exception as e:
        print(p, 'skip', e)
