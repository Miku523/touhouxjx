# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
for name in ('stage3_ateam_v21.wav', 'stage3_ateam_v22.wav'):
    x, sr = sf.read(os.path.join(base, name))
    if x.ndim > 1: x = x.mean(1)
    print('==', name)
    t = 36.0
    while t < 39.6:
        seg = x[int(t*sr):int((t+0.2)*sr)]
        rms = float(np.sqrt((seg**2).mean()))
        print('  %5.2fs %.3f %s' % (t, rms, '#' * int(rms*300)))
        t += 0.2
