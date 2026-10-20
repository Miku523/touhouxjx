# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
base = os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools', 'build')
for name in ('stage3_ateam_v22.wav', 'stage3_ateam_v24.wav'):
    x, sr = sf.read(os.path.join(base, name))
    if x.ndim > 1: x = x.mean(1)
    print('==', name, 'peak %.3f rms %.4f' % (float(np.abs(x).max()), float(np.sqrt((x**2).mean()))))
    t = 37.4
    while t < 39.2:
        seg = x[int(t*sr):int((t+0.2)*sr)]
        print('  %5.2fs %.3f %s' % (t, float(np.sqrt((seg**2).mean())), '#' * int(float(np.sqrt((seg**2).mean()))*320)))
        t += 0.2
