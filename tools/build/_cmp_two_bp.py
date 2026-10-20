# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def prof(p, t0=0, t1=70):
    d,sr=sf.read(p,always_2d=True); x=d.mean(1).astype(np.float32)
    seg=x[int(t0*sr):int(min(t1,len(x)/sr)*sr)]
    X=np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2; f=np.fft.rfftfreq(len(seg),1/sr); tot=X.sum()
    bands=[round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
    return bands, round(float((f*X).sum()/tot)), round(float(np.sqrt((x**2).mean())),3), round(float(np.abs(x).max()),3)
for name, p in (('ref3 蓝本', r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3'),
                ('ref4 蓝本', r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref4.mp3'),
                ('st2 v2 (155)', 'tools/build/stage2_ooedo_v2.wav'),
                ('st2 幻想夜虫 (83)', 'tools/build/stage2_fantasia_v1.wav')):
    print(name, '→ 频段%', *prof(p))
# 剪 70 秒试听
for src, out in (('tools/build/stage2_ooedo_v2.wav','tools/build/stage2_v2_70s.wav'),
                 ('tools/build/stage2_fantasia_v1.wav','tools/build/stage2_fantasia_70s.wav')):
    d,sr=sf.read(src,always_2d=True); x=d.mean(1)[:int(70*sr)].copy()
    k=int(0.5*sr); x[-k:]*=np.linspace(1,0,k)
    sf.write(out, x, sr, subtype='PCM_16')
    print('写入', out)
