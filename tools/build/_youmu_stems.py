import json, os, glob
import numpy as np, soundfile as sf
K='tools/build/_youmu_kit'
m=json.load(open(K+'/metrics.json', encoding='utf-8'))
open(K+'/metrics_keys.txt','w').write('\n'.join(f'{k}: {v}' for k,v in m.items() if not isinstance(v,(list,dict))))
rows=[]
for p in sorted(glob.glob(K+'/stems/*.wav')):
    x,sr=sf.read(p, frames=-1)
    x=np.asarray(x,dtype=float)
    if x.ndim>1: x=x.mean(axis=1)
    pk=float(np.max(np.abs(x))) if x.size else 0.0
    rms=float(np.sqrt(np.mean(x*x))) if x.size else 0.0
    rdb=20*np.log10(rms+1e-12)
    rows.append(f'{os.path.basename(p):>18} pk={pk:.4f} rms={rdb:7.2f} dB')
open(K+'/stem_levels.txt','w').write('\n'.join(rows))
print('ok')
