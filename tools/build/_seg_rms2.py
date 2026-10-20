# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
for name in ('stage3_ateam_v15.wav','stage3_ateam_v17.wav'):
    x, sr = sf.read(os.path.join(base, name))
    if x.ndim > 1: x = x.mean(1)
    print('==', name)
    for a,b in ((23.84,28.61),(28.61,31.78),(31.78,34.96),(34.96,38.15),(38.15,41.0)):
        seg = x[int(a*sr):int(b*sr)]
        rms = float(np.sqrt((seg**2).mean()))
        print('  %5.2f-%5.2f  RMS %.4f  (%.1f dBFS)' % (a,b,rms,20*np.log10(max(rms,1e-9))))
