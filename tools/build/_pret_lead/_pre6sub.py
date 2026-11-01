# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
x, sr = sf.read('tools/build/_pret_kit/pre6_stereo.wav', always_2d=True)
tot = x[:,0]**2 + x[:,1]**2
for tag,a,b in [('A_pre',2.963,38.519),('3-4',38.519,56.296),('C_Bmaj',56.296,80.0)]:
    pw = float(np.mean(tot[int(a*sr):int(b*sr)]))
    print(tag, 'mono_eq %.2f' % (10*np.log10(pw/2)+3.01))
