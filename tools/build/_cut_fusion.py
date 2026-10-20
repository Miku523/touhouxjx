# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np
d,sr=sf.read('tools/build/stage2_fusion_v1.wav',always_2d=True); x=d.mean(1)[:int(70*sr)].copy()
k=int(0.5*sr); x[-k:]*=np.linspace(1,0,k)
sf.write('tools/build/stage2_fusion_70s.wav', x, sr, subtype='PCM_16')
print('ok %.1fs' % (len(x)/sr))
