
import os, numpy as np, soundfile as sf
d = r"C:\Users\GuSheng\Downloads\HKS\tools\build\_aya_lead\stems_v3b"
for f in sorted(os.listdir(d)):
    x, sr = sf.read(os.path.join(d, f), dtype='float64')
    if x.ndim > 1: x = x.mean(axis=1)
    pk = np.abs(x).max()
    print('%-16s peak %7.4f (%.1f dBFS)  rms %.1f' % (f, pk, 20*np.log10(max(pk,1e-9)), 20*np.log10(max(np.sqrt(np.mean(x*x)),1e-12))))
