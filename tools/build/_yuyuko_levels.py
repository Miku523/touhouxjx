import os, glob
import numpy as np, soundfile as sf
K='tools/build/_yuyuko_kit'
rows=[]
for p in sorted(glob.glob(K+'/stems/*.wav')):
    x,sr=sf.read(p, frames=-1)
    x=np.asarray(x,dtype=float)
    if x.ndim>1: x=x.mean(axis=1)
    pk=float(np.max(np.abs(x))) if x.size else 0.0
    rms=float(np.sqrt(np.mean(x*x))) if x.size else 0.0
    rows.append(f'{os.path.basename(p):>18} pk={pk:.4f} rms={20*np.log10(rms+1e-12):7.2f} dB')
open(K+'/stem_levels.txt','w',encoding='utf-8').write('\n'.join(rows))
print('done')