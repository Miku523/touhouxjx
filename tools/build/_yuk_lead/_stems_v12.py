# -*- coding: utf-8 -*-
import glob, os, io
import numpy as np, soundfile as sf
rows=[]
for p in sorted(glob.glob('tools/build/_yuk_kit/stems_v12/*.wav')):
    x,sr=sf.read(p, always_2d=True); m=x.mean(axis=1)
    r=20*np.log10(np.sqrt(np.mean(m**2))+1e-12)
    rows.append((os.path.basename(p), round(float(r),2)))
rows.sort(key=lambda t:t[1], reverse=True)
io.open('tools/build/_yuk_kit/_stems_v12.txt','w',encoding='utf-8').write('\n'.join('%-24s %7.2f'%(a,b) for a,b in rows))
