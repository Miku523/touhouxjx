import os, sys, json
import numpy as np, soundfile as sf
SEC=[('intro',0,11),('orig',11,64.8),('bridge',64.8,74.8),('var',74.8,102.2),('coda',102.2,113)]
def db(x): return 20*np.log10(max(1e-9,x))
for path in sys.argv[1:]:
    y,sr=sf.read(path,dtype='float64')
    if y.ndim>1:
        tot=np.sqrt(np.mean(y**2))   # 左右总功率口径
        mono=y.mean(axis=1)
    else:
        tot=np.sqrt(np.mean(y**2)); mono=y
    print(os.path.basename(path),'sr',sr,'dur %.3f'%(len(mono)/sr),'whole %.2f peak %.4f'%(db(tot),np.max(np.abs(y))))
    if y.ndim>1:
        print('  L/R corr %.4f'%float(np.corrcoef(y[:,0],y[:,1])[0,1]))
    for nm,a,b in SEC:
        seg=y[int(a*sr):int(b*sr)]
        if y.ndim>1: v=np.sqrt(np.mean(seg**2))
        else: v=np.sqrt(np.mean(seg**2))
        print('  %-7s %.2f'%(nm,db(v)))
