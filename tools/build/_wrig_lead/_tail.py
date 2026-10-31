# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, json
x, sr = sf.read('tools/build/_wrig_kit/wriggle_v8_mono.wav', dtype='float64')
def db(v): return 20*np.log10(max(v,1e-12))
def seg(a,b):
    s,e=int(a*sr),min(int(b*sr),len(x))
    return db(np.sqrt(np.mean(x[s:e]**2)))
print('outro first bar %.2f  last bar %.2f'%(seg(91.355,92.903),seg(102.19,103.742)))
print('coda 0-4 bars %.2f  4-6 %.2f  last2 %.2f  last1 %.2f'%(seg(103.742,109.935),seg(109.935,113.032),seg(113.032,116.129),seg(114.581,116.129)))
secs=json.load(open('tools/build/_wrig_lead/secs.json',encoding='utf-8'))
print(secs)