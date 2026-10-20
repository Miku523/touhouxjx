# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
for p in ('tools/build/stage1_merge_v2_orig.wav','tools/build/stage1_merge_v2_phx.wav'):
    d,sr = sf.read(p, always_2d=True); x=d.mean(1)
    print(p.split('/')[-1], 'RMS %.3f 峰 %.3f' % (float(np.sqrt((x**2).mean())), float(np.abs(x).max())))
    seg = x[int(10*sr):int(70*sr)]
    X=np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2; f=np.fft.rfftfreq(len(seg),1/sr); tot=X.sum()
    print('  频段%', [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))], '质心', round(float((f*X).sum()/tot)))
