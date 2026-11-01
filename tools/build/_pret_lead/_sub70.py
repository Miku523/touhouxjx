# -*- coding: utf-8 -*-
import sys, numpy as np, soundfile as sf
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def seg_rms(p, segs):
    x, sr = sf.read(p, always_2d=True); m = x.mean(axis=1)
    for tag, a, b in segs:
        s = m[int(a*sr):int(b*sr)]
        print('   %-10s %6.2f-%6.2f %6.2f' % (tag, a, b, 20*np.log10(np.sqrt(np.mean(s**2)))))
print('pre6 sections:')
seg_rms('tools/build/_pret_kit/pre6_v70_mono.wav', [('intro',0,2.963),('A_pre',2.963,38.519),('3-4',38.519,56.296),('C_Bmaj',56.296,80.0),('tail',80.0,82.963)])
print('pre1 bass sections:')
seg_rms('tools/build/_pret_kit/pre1_bass.wav', [('A0',3.31,23.172),('A',23.172,49.655),('B',49.655,62.897),('C',62.897,76.138),('bridge',76.138,82.759),('coda',82.759,89.379)])
