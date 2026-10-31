import os, sys
import numpy as np, soundfile as sf
SR=22050
SEC=[('intro',0,11),('orig',11,64.8),('bridge',64.8,74.8),('var',74.8,102.2),('coda',102.2,113)]
def db(x): return 20*np.log10(max(1e-9,x))
for path in sys.argv[1:]:
    y,sr=sf.read(path,dtype='float64')
    if y.ndim>1: y=y.mean(axis=1)
    print(os.path.basename(path),'whole %.2f peak %.4f crest %.2f'%(db(np.sqrt(np.mean(y**2))),np.max(np.abs(y)),db(np.max(np.abs(y))/np.sqrt(np.mean(y**2)))))
    for nm,a,b in SEC:
        seg=y[int(a*SR):int(b*SR)]
        print('  %-7s %.2f'%(nm,db(np.sqrt(np.mean(seg**2)))))
